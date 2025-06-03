/**
 * Type: Micro Service
 * Description: A short-lived service which is expected to complete within a fixed period of time.
 * @param {CbServer.BasicReq} req
 * @param {string} req.systemKey
 * @param {string} req.systemSecret
 * @param {string} req.userEmail
 * @param {string} req.userid
 * @param {string} req.userToken
 * @param {boolean} req.isLogging
 * @param {[id: string]} req.params
 * @param {CbServer.Resp} resp
 */

function ai_components_uninstall(req, resp) {
  
  const params = req.params;
  const entity_id = params.entity_id; 
  const CACHE_KEY = 'google-bigquery-config'
  const PROJECT_ID = 'clearblade-ipm'
  const DATASET_ID = 'clearblade_components'

  function removeMLPipeline() {
    const col = ClearBladeAsync.Collection('ai_components_ml_pipelines');
    const query = ClearBladeAsync.Query().equalTo('component_id', params.component_id).equalTo('asset_type_id', entity_id);
    return col.remove(query)
  }

  function getAccessToken() {
    const cache = ClearBladeAsync.Cache('AccessTokenCache');
    return cache.get(CACHE_KEY).then(function(token){
      return token || {accessToken: ""};
    }).catch(function(error){
      console.log('Error getting access token: ', error);
      return {accessToken: ""};
    });
  }

  function removeBQData(token, id) {
    const query = 'DELETE FROM ' + PROJECT_ID + '.' + DATASET_ID + '.' + cbmeta.system_key + 'WHERE asset_type_id = ' + id + 'AND date_time < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 90 MINUTE;';
    const jobConfig = {
      configuration: {
        query: {
          query: query,
          useLegacySql: false,
        },
      },
    };

    return fetch('https://bigquery.googleapis.com/bigquery/v2/projects/' + PROJECT_ID + '/jobs', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(jobConfig),
    }).then(function(response) {
      if (!response.ok) {
        return Promise.reject(response.text());
      }
      return Promise.resolve('Deleted BQ data');
    }).catch(function(error) {
      return Promise.reject(error);
    });
  }

  function getEntities() {
    return fetch('https://' + cbmeta.platform_url + '/api/v/1/code/' + cbmeta.system_key + '/fetchTableItems?id=components.read', {
      method: 'POST',
      headers: {
        'ClearBlade-UserToken': req.userToken,
      },
      body: JSON.stringify({
        name: 'components.read',
        body: {
          query: {
            filters: {
              id: params.component_id,
            },
          },
        },
      }),
    }).then(function(response) {
      if (!response.ok) {
        throw new Error('Failed to fetch component: ' + response.statusText);
      }
      return response.json();
    }).then(function(data) {

      const entityComponent = data.results.DATA.filter(function(item) {
        return item.entity_id === entity_id;
      });

      if (entityComponent.length === 0) {
        throw new Error('Component not found for entity: ' + entity_id);
      }

      return {
        count: data.results.COUNT,
        entities: entityComponent[0].settings.entities,
      }
    })
  }

  function getAssetTypeInfo() {
    return fetch('https://' + cbmeta.platform_url + '/api/v/1/code/' + cbmeta.system_key + '/fetchTableItems?id=assetTypes.read', {
      method: 'POST',
      headers: {
        'ClearBlade-UserToken': req.userToken,
      },
      body: JSON.stringify({
        name: 'assetTypes.read',
        body: {
          "query": {
            "Queries": [
              [
                {
                    "Operator": "=",
                    "Field": "id",
                    "Value": entity_id
                }
              ]
            ],
            "Order": [],
            "PageSize": 100,
            "PageNumber": 1,
            "Columns": [],
            "Distinct": "",
            "GroupBy": [],
            "RawQuery": "",
            "PrimaryKey": []
        }
        },
      }),
    }).then(function(response) {
      if (!response.ok) {
        throw new Error('Failed to fetch asset type info: ' + response.statusText);
      }
      return response.json();
    }).then(function(data) {
      if (data.results.COUNT === 0) {
        throw new Error('Asset type not found');
      }
      return data.results.DATA[0];
    });
  }

  function getGroupsForAssetType() {
    return fetch('https://' + cbmeta.platform_url + '/api/v/1/code/' + cbmeta.system_key + '/fetchTableItems?id=groupsForAssetType.read', {
      method: 'POST',
      headers: {
        'ClearBlade-UserToken': req.userToken,
      },
      body: JSON.stringify({
        name: 'groupsForAssetType.read',
        body: {
          id: entity_id,
        },
      }),
    })
      .then(function(response) {
        if (!response.ok) {
          throw new Error('Failed to fetch groups for asset type: ' + response.statusText);
        }
        return response.json();
      })
      .then(function(data) {
        if (data.results.COUNT === 0) {
          throw new Error('No groups found for asset type');
        }
        return data.results.DATA.map(function(group) {
          return group.id;
        });
      });
  }

  function removeEntities(entityInfo, assetTypeInfo, groupIds) {
    const entities = entityInfo.entities;
    const totalCount = entityInfo.count;
    
    // Remove anomaly detection attributes from asset type schema
    const schema = JSON.parse(assetTypeInfo.schema);
    const newSchema = schema.filter(function(attr) {
      return attr.attribute_name !== 'anomaly_score' && 
      attr.attribute_name !== 'anomaly_breakdown'
    });
    assetTypeInfo.schema = JSON.stringify(newSchema);
    // Update asset type with removed attributes
    const updateAssetType = fetch('https://' + cbmeta.platform_url + '/api/v/1/code/' + cbmeta.system_key + '/updateTableItems?id=assetTypes.update', {
      method: 'POST',
      headers: {
        'ClearBlade-UserToken': req.userToken,
      },
      body: JSON.stringify({
        name: 'assetTypes.update',
        body: {
          item: assetTypeInfo,
          groupIds,
        },
      }),
    }).then(function(response) {
      if (!response.ok) {
        throw new Error('Failed to update asset type: ' + response.statusText);
      }
      return response.json();
    });

    console.log('totalCount: ', totalCount);
    // Remove event type
    var removeEventType;
    if (totalCount === 1) {
      removeEventType = fetch('https://' + cbmeta.platform_url + '/api/v/1/code/' + cbmeta.system_key + '/deleteTableItems?id=eventTypes.delete', {
        method: 'POST',
        headers: {
          'ClearBlade-UserToken': req.userToken,
        },
        body: JSON.stringify({
          name: 'eventTypes.delete',
          body: {
            id: 'Anomaly Detected'
          },
        }),
      }).then(function(response) {
        if (!response.ok && response.status !== 404) {
          throw new Error('Failed to delete event type: ' + response.statusText);
        }
        return response.json();
      });
    } else {
      removeEventType = Promise.resolve();
    }

    // Remove rule type
    const removeRuleType = fetch('https://' + cbmeta.platform_url + '/api/v/1/code/' + cbmeta.system_key + '/deleteTableItems?id=ruleTypes.delete', {
      method: 'POST',
      headers: {
        'ClearBlade-UserToken': req.userToken,
      },
      body: JSON.stringify({
        name: 'ruleTypes.delete',
        body: {
          id: entities.rule_types[0].id
        },
      }),
    }).then(function(response) {
      if (!response.ok && response.status !== 404) {
        throw new Error('Failed to delete rule type: ' + response.statusText);
      }
      return response.json();
    });

    // Remove rule
    const removeRule = fetch('https://' + cbmeta.platform_url + '/api/v/1/code/' + cbmeta.system_key + '/deleteTableItems?id=rules.delete', {
      method: 'POST',
      headers: {
        'ClearBlade-UserToken': req.userToken,
      },
      body: JSON.stringify({
        name: 'rules.delete',
        body: {
          id: entities.rules[0].id
        },
      }),
    }).then(function(response) {
      if (!response.ok && response.status !== 404) {
        throw new Error('Failed to delete rule: ' + response.statusText);
      }
      return response.json();
    });

    return Promise.all([
      updateAssetType,
      removeEventType,
      removeRuleType,
      removeRule,
    ]);
  }

  Promise.all([
    removeMLPipeline(),
    getAccessToken(),
  ]).then(function(results) {
    const token = results[1];
    if (!token || !token.accessToken) {
      console.log('No access token found, so not deleting BQ data');
      return;
    }
    return removeBQData(token.accessToken, entity_id);
  }).then(function(){
    return Promise.all([getEntities(), getAssetTypeInfo(), getGroupsForAssetType()]);
  }).then(function(results){
    const entityInfo = results[0];
    const assetTypeInfo = results[1];
    const groupIds = results[2];
    return removeEntities(entityInfo, assetTypeInfo, groupIds);
  }).then(resp.success).catch(resp.error);

}
