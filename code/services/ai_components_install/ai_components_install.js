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

function ai_components_install(req, resp) {
  const params = req.params;
  const entity_id = params.entity_id;
  const component_id = params.component_id;
  const prefix = params.prefix;
  const mfe_settings = params.mfe_settings;
  const client = new MQTT.Client();

  function createMLPipeline() {
    const col = ClearBladeAsync.Collection('ai_components_ml_pipelines');
    const run_frequency = 'Never';
    const feature_attributes = [];
    const data_threshold = 100000;

    if (mfe_settings.model_meta) {
      if (mfe_settings.model_meta.run_frequency) {
        run_frequency = mfe_settings.model_meta.run_frequency;
      }
      if (mfe_settings.model_meta.data_threshold) {
        data_threshold = mfe_settings.model_meta.data_threshold;
      }
    }

    if (mfe_settings.features) {
      feature_attributes = mfe_settings.features.map(function (feature) { return feature.attribute_name });
    }
    
    return col.create({
      asset_type_id: entity_id,
      component_id: component_id,
      run_frequency,
      feature_attributes,
      data_threshold,
    }).then(function(){
      return client.publish('_ai/_components/_install', JSON.stringify({
        id: prefix + "_" + component_id,
      }));
    }).catch(function(err) {
      throw err;
    })
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

  function createADAttributes(assetTypeInfo, groupIds) {
    const attributesToAdd = [
      {
        uuid: newUUID(),
        attribute_name: "anomaly_score",
        attribute_type: "number",
        attribute_label: "Anomaly Score",
        attribute_edit_widget: "slider",
        attribute_view_widget: "gauge",
        keep_history: true,
        hide_attribute: false,
        readonly_attribute: true,
      },
      {
        uuid: newUUID(),
        attribute_name: "anomaly_breakdown",
        attribute_type: "text",
        attribute_label: "Anomaly Breakdown",
        attribute_edit_widget: "input",
        attribute_view_widget: "label",
        keep_history: true,
        hide_attribute: false,
        readonly_attribute: true,
      },
    ];
    const schema = JSON.parse(assetTypeInfo.schema);
    const newSchema = attributesToAdd.concat(schema);
    assetTypeInfo.schema = JSON.stringify(newSchema);
    const attributeInfo = attributesToAdd.map(function(attr) {
      return {
        uuid: attr.uuid,
        attribute_label: attr.attribute_label,
      };
    });
    return fetch('https://' + cbmeta.platform_url + '/api/v/1/code/' + cbmeta.system_key + '/updateTableItems?id=assetTypes.update', {
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
        throw new Error('Failed to update asset type with anomaly detection attributes: ' + response.statusText);
      }
      return response.json();
    }).then(function() {
      return attributeInfo;
    });
  }
  
  function createADEventType(groupIds) {
    const eventTypeToAdd = {
      action_types: ["send_sms", "send_email", "send_teams_message"],
      closed_states: [],
      description: "Event type for anomaly detection.",
      has_lifecycle: false,
      id: "Anomaly Detected",
      label: "Anomaly Detected",
      open_states: [],
      priority: 2,
      severity: 3,
    };

    return fetch('https://' + cbmeta.platform_url + '/api/v/1/code/' + cbmeta.system_key + '/createTableItems?id=eventTypes.create', {
      method: 'POST',
      headers: {
        'ClearBlade-UserToken': req.userToken,
      },
      body: JSON.stringify({
        name: 'eventTypes.create',
        body: {
          item: eventTypeToAdd,
          groupIds,
        },
      }),
    }).then(function(response) {
      if (response.status === 409) {
        return {id: eventTypeToAdd.id, label: eventTypeToAdd.label};
      }
      if (response.status !== 200) {
        throw new Error('Failed to create anomaly detection event type: ' + response.statusText);
      }
      return {id: eventTypeToAdd.id, label: eventTypeToAdd.label};
    })
  }
  
  function createADRuleType(assetTypeInfo, groupIds) {
    const uuid = newUUID();
    const ruleTypeToAdd = {
      id: uuid,
      label: assetTypeInfo.label + ' Anomaly Detection',
      event_type_ids: ["Anomaly Detected"],
      include_timeframe: false,
      is_invalid: false,
      is_external: false,
      conditions: {
        and: [
          {
            type: "state",
            meta: [
              {
                entity: {
                  suffix: "",
                  filter_type: [
                    {
                      type: "types",
                      label: "Asset Types",
                      id: "asset_types",
                    },
                  ],
                  prefix: "When",
                  selected_entity: {
                    value: entity_id,
                    ancestorId: entity_id,
                  },
                  allow_types: true,
                  allow_specific: true,
                },
              },
              {
                relationship: {
                  attribute_type: "number",
                  suffix: "",
                  equal: "",
                  greaterThanInclusive: "is greater than",
                  attribute: "anomaly_score",
                  attribute_label: "Anomaly Score",
                },
              },
              {
                duration: {
                  include_duration: false,
                },
              },
            ],
          },
        ],
      },
    };

    return fetch('https://' + cbmeta.platform_url + '/api/v/1/code/' + cbmeta.system_key + '/createTableItems?id=ruleTypes.create', {
      method: 'POST',
      headers: {
        'ClearBlade-UserToken': req.userToken,
      },
      body: JSON.stringify({
        name: 'ruleTypes.create',
        body: {
          item: ruleTypeToAdd,
          groupIds,
        },
      }),
    }).then(function(response) {
      if (response.status === 409) {
        return null;
      }
      if (response.status !== 200) {
        throw new Error('Failed to create anomaly detection rule type: ' + response.statusText);
      }
      return {id: uuid, label: ruleTypeToAdd.label};
    })
  }

  function createADRule(assetTypeInfo, ruleTypeId) {
    const uuid = newUUID();
    const ruleToAdd = {
      "action_ids": [],
      "closed_by_rule": {},
      "closes_ids": [],
      "allow_multiple_open_events": false,
      "conditions": {
        "and": [
          {
            "entity": {
              "id": entity_id,
              "entity_type": "asset_types"
            },
            "relationship": {
              "operator": "greaterThanInclusive",
              "attribute": "anomaly_score",
              "attribute_type": "state",
              "duration": {
                "value": 0,
                "unit": "seconds"
              },
              "value": 65
            }
          }
        ]
      },
      "custom_id": "",
      "event_type_id": "Anomaly Detected",
      "id": uuid,
      "is_disabled": false,
      "is_invalid": false,
      "label": "Anomaly Detected on " + assetTypeInfo.label,
      "priority": 2,
      "rule_type_id": ruleTypeId,
      "severity": 3,
      "timeframe": {
        "type": "",
        "startTime": "00:00",
        "endTime": "00:00",
        "days": []
      }
    }

    return fetch('https://' + cbmeta.platform_url + '/api/v/1/code/' + cbmeta.system_key + '/createTableItems?id=rules.create', {
      method: 'POST',
      headers: {
        'ClearBlade-UserToken': req.userToken,
      },
      body: JSON.stringify({
        name: 'rules.create',
        body: {
          item: ruleToAdd,
        },
      }),
    }).then(function(response) {
      if (response.status === 409) {
        return null;
      }
      if (response.status !== 200) {
        throw new Error('Failed to create anomaly detection rule: ' + response.statusText);
      }
      return {id: uuid, label: ruleToAdd.label};
    })
  }

  function addEntityIdsToCollection(entities) {
    const col = ClearBladeAsync.Collection('ai_components_ml_pipelines');
    const query = ClearBladeAsync.Query().equalTo('asset_type_id', entity_id);
    
    return col.update(query, {
      entities: entities,
    })
  }

  var groups = [];
  var assetTypeInfo = {};
  var attributeIds = [];
  var eventTypeInfo = {};
  var ruleTypeInfo = {};

  Promise.all([
    createMLPipeline(),
    getGroupsForAssetType(),
    getAssetTypeInfo()
  ]).then(function(results) {
    groups = results[1];
    assetTypeInfo = results[2]
    return Promise.all([
      createADAttributes(assetTypeInfo, groups),
      createADEventType(groups),
      createADRuleType(assetTypeInfo, groups),
    ]);
  }).then(function(results) {
    attributeIds = results[0];
    eventTypeInfo = results[1];
    ruleTypeInfo = results[2];
    return createADRule(assetTypeInfo, ruleTypeInfo.id);
  }).then(function(ruleInfo) {
    return addEntityIdsToCollection({
      attributes: attributeIds,
      event_types: [eventTypeInfo],
      rule_types: [ruleTypeInfo],
      rules: [ruleInfo],
    });
  }).then(resp.success).catch(resp.error);
}
