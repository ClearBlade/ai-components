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

function ai_components_setup(req, resp) {
  const SECRET_KEY = 'gcp-bigquery-service-account'
  const CACHE_KEY = 'google-bigquery-config'
  const PROJECT_ID = 'clearblade-ipm'
  const DATASET_ID = 'clearblade_components'
  
  var mySecret = {}

  checkForSubscription().then(function(subscriptionExists) {
    if (subscriptionExists) {
      resp.success('Done');
    }
    return Promise.resolve();
  }).then(function() {
    return readSecret();
  }).then(function(secret) {
    if (secret === '') {
      resp.error('secret not found: ' + SECRET_KEY)
    }
    mySecret = secret;
    return addSubscriptionRow(secret);
  }).then(function (config){
    return generateAccessToken(config);
  }).then(function(tokenInfo) {
    return Promise.all([
      createBQTable(tokenInfo),
      createExternalDB(mySecret),
      createBucketSet(mySecret),
    ]);
  }).then(function() {
    resp.success('Setup completed successfully!');
  }).catch(function(err) {
    resp.error(err);
  });


  function readSecret() {
    const secret = ClearBladeAsync.Secret();
    return secret.read(SECRET_KEY);
  }

  function checkForSubscription() {
    const col = ClearBladeAsync.Collection('subscriptions');
    return col.fetch(ClearBladeAsync.Query().equalTo('id', CACHE_KEY)).then(function(data) {
      if (data.DATA.length > 0) {
        return Promise.resolve(true);
      }
      return Promise.resolve(false);
    });
  }

  function addSubscriptionRow(secret) {
    const config = {
      SUBSCRIPTION_SERVICE_ACCOUNT_PRIVATE_KEY: secret.private_key,
      SERVICE_EMAIL: secret.client_email,
      API_ENDPOINT: 'https://bigquery.googleapis.com/bigquery/v2/projects/' + PROJECT_ID + '/datasets/' + DATASET_ID,
      ALGORITHM: 'RS256',
      AUTH_SCOPE: 'https://www.googleapis.com/auth/cloud-platform',
      TOKEN_EXPIRY_PERIOD_IN_SECS: 3600,
    }
    const col = ClearBladeAsync.Collection('subscriptions');
    return col.create({
      details: 'Google Vertex AI Anomaly Detection',
      type: 'googlevertexai',
      config: JSON.stringify(config),
      id: CACHE_KEY,
    }).then(function() {
      return Promise.resolve(config);
    }).catch(function(error) {
      return Promise.reject(error);
    });
  }

  function generateAccessToken(config) {
    const claims = {
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + config.TOKEN_EXPIRY_PERIOD_IN_SECS,
      aud: 'https://oauth2.googleapis.com/token',
      scope: config.AUTH_SCOPE,
      iss: config.SERVICE_EMAIL,
    };
    const jwtToken = crypto.create_jwt(claims, config.ALGORITHM, config.SUBSCRIPTION_SERVICE_ACCOUNT_PRIVATE_KEY);

    return fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: JSON.stringify({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwtToken,
      }),
    }).then(function (response) {
      if (!response.ok) {
        const responseText = response.text();
        console.error('Failed to get token: ', response.statusText, responseText);
        throw new Error(response.statusText + ': ' + responseText);
      }
      return (response.json());
    });
  }

  function createBQTable(tokenInfo) {
    if (!tokenInfo.access_token) {
      return Promise.reject('access_token not found in tokenInfo');
    }

    const tableResource = {
      tableReference: {
        projectId: PROJECT_ID,
        datasetId: DATASET_ID,
        tableId: cbmeta.system_key,
      },
      schema: {
        fields: [
          { name: 'date_time', type: 'TIMESTAMP', mode: 'NULLABLE' },
          { name: 'asset_type_id', type: 'STRING', mode: 'NULLABLE' },
          { name: 'asset_id', type: 'STRING', mode: 'NULLABLE' },
          { name: 'data', type: 'STRING', mode: 'NULLABLE' },
        ],
      },
    };

    return fetch("https://bigquery.googleapis.com/bigquery/v2/projects/" + PROJECT_ID + "/datasets/" + DATASET_ID + "/tables", {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + tokenInfo.access_token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tableResource),
    }).then(function(response) {
      if (!response.ok) {
        return Promise.resolve(response.text());
      }
      return Promise.resolve('BigQuery table created!');
    }).catch(function(error) {
      return Promise.reject(error);
    });
  }

  function createExternalDB(secret) {
    return fetch('https://' + cbmeta.platform_url + '/api/v/4/external-db/' + cbmeta.system_key, {
      headers: {
        'ClearBlade-DevToken': req.userToken,
      },
      body: JSON.stringify({
        name: 'IAComponentsBQDB',
        dbtype: 'bigquery',
        credentials: {
          authentication_type: 'json',
          dbtype: 'bigquery',
          project_id: 'clearblade-ipm',
          credentials: JSON.stringify(secret),
        },
      }),
      method: 'POST',
    })
      .then(function(response) {
        if (!response.ok) {
          return Promise.reject(response.text());
        }
        return Promise.resolve('External DB created!');
      })
      .catch(function(error) {
        return Promise.reject(error);
      });
  }

  function createBucketSet(secret) {
    return fetch('https://' + cbmeta.platform_url + '/api/v/4/bucket_sets/' + cbmeta.system_key, {
      headers: {
        'ClearBlade-DevToken': req.userToken,
      },
      body: JSON.stringify({
        name: 'ia-components',
        platform_storage: 'google',
        edge_storage: 'local',
        platform_config: {
          bucket_name: 'clearblade-components',
          credentials: secret,
        },
        edge_config: {
          root: '/tmp/clearblade_platform_buckets',
        },
      }),
      method: 'POST',
    })
      .then(function(response) {
        if (!response.ok) {
          return Promise.reject(response.text());
        }
        return Promise.resolve('Bucket set created!');
      })
      .catch(function(error) {
        return Promise.reject(error);
      });
  }
}
