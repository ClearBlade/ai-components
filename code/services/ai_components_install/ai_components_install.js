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
  const mfe_settings = params.mfe_settings;
  const col = ClearBladeAsync.Collection('ai_components_ml_pipelines');
  const client = new MQTT.Client();

  var run_frequency = 'Never';
  var feature_attributes = [];
  var data_threshold = 100000;

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
  
  col.create({
    asset_type_id: params.entity_id,
    component_id: params.component_id,
    run_frequency,
    feature_attributes,
    data_threshold,
  }).then(function(){
    return client.publish('_ai/_components/_install', JSON.stringify({
      id: params.prefix + "_" + params.component_id,
    }));
  }).then(resp.success).catch(resp.error);
}
