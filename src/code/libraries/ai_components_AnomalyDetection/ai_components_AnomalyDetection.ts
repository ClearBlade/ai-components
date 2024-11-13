import { ComponentsHelper } from "../ComponentsHelper/ComponentsHelper";
import { BQDataSchema } from "../ComponentsHelper/types";

/**
 * Type: Library
 * Description: A library that contains a function which, when called, returns an object with a public API.
 */

export interface AnomalyData {
  assetId: string;
  is_anomaly: boolean;
  is_anomaly_percentage: number;
  contributing_attributes: ContributingAttributes[];
}

export interface ContributingAttributes {
  attribute: string;
  value: number;
  contribution_percentage: number;
}

export interface PreprocessedData {
  mainFeatures: string[];
  incomingFeatures: string[][];
  incomingFeaturesVals: number[][];
  incomingAssetIds: string[][];
  incomingAssetIdsVals: number[][];
}

export function ai_components_AnomalyDetection(ID: string) {
  const helper = ComponentsHelper();

  let imputer: CbServer.ClearBladeAIModel | undefined;
  let scaler: CbServer.ClearBladeAIModel | undefined;
  let model: CbServer.ClearBladeAIModel | undefined;
  let anomaly_probab_helper: CbServer.ClearBladeAIModel | undefined;

  async function initializeArtifacts(data: BQDataSchema) {
    if (imputer && scaler && model && anomaly_probab_helper) {
      const shouldReinit = await helper.shouldReInitializeArtifacts(ID, data);
      if (!shouldReinit) {
        return;
      }
    }

    try {
      console.log("Initializing artifacts for anomaly detection model");
      const root = `outbox/${data.asset_type_id}/anomaly-detection-artifacts`;
      const imputer_options = {
        bucket_set: helper.ARTIFACTS_BUCKET_SET,
        path: root + "/imputer.onnx",
      };
      const scaler_options = {
        bucket_set: helper.ARTIFACTS_BUCKET_SET,
        path: root + "/scaler.onnx",
      };
      const model_options = {
        bucket_set: helper.ARTIFACTS_BUCKET_SET,
        path: root + "/ad-autoencoder.onnx",
      };
      const anomaly_probab_helper_options = {
        bucket_set: helper.ARTIFACTS_BUCKET_SET,
        path: root + "/get_anomaly_labels_and_score.onnx",
      };

      anomaly_probab_helper = new ClearBladeAI.Model(
        anomaly_probab_helper_options
      );
      model = new ClearBladeAI.Model(model_options);
      scaler = new ClearBladeAI.Model(scaler_options);
      imputer = new ClearBladeAI.Model(imputer_options);
    } catch (err) {
      return;
    }
  }

  async function run(
    data: BQDataSchema,
    settings: { entities: { attributes: { attribute_name: string }[] } }
  ): Promise<Record<string, unknown>> {
    try {
      if (!imputer || !scaler || !model || !anomaly_probab_helper) {
        return Promise.reject(
          `Artifacts for component "${ID}" are not generated yet for ${data.asset_type_id}.`
        );
      }
      console.log(`running ${ID} model for data: ${JSON.stringify(data)}`);
      const imputer_in = imputer.inputs[0].name;
      const imputer_out = imputer.outputs[0].name;

      const scaler_in = scaler.inputs[0].name;
      const scaler_out = scaler.outputs[0].name;

      const model_in = model.inputs[0].name;
      const model_out = model.outputs[0].name;

      const anomaly_probab_helper_in_1 = anomaly_probab_helper.inputs[0].name;
      const anomaly_probab_helper_in_2 = anomaly_probab_helper.inputs[1].name;

      const preprocessed_data = await preprocessData(data);
      const imputed_data = await imputer.exec([], {
        [imputer_in]: concatTensors(
          preprocessed_data.incomingFeaturesVals,
          preprocessed_data.incomingAssetIdsVals
        ),
      });
      const scaled_data = await scaler.exec([], {
        [scaler_in]: trimTensor(
          (imputed_data as unknown as Record<string, number[][]>)[imputer_out],
          preprocessed_data.incomingFeaturesVals[0].length
        ),
      });
      const model_input = concatTensors(
        (scaled_data as unknown as Record<string, number[][]>)[scaler_out],
        preprocessed_data.incomingAssetIdsVals
      );
      const model_data = await model.exec([], { [model_in]: model_input });
      const helper_data = await anomaly_probab_helper.exec([], {
        [anomaly_probab_helper_in_1]: model_input,
        [anomaly_probab_helper_in_2]: (
          model_data as unknown as Record<string, number[][]>
        )[model_out],
      });

      const anomaly_info = getAnomalyInfo(
        helper_data as unknown as Record<string, number[][]>,
        preprocessed_data,
        anomaly_probab_helper.outputs
      )[0];

      if (
        !settings.entities?.attributes ||
        settings.entities.attributes.length < 2
      ) {
        return {};
      }

      console.log(
        `returning results for ${ID} model: ${JSON.stringify(anomaly_info)}`
      );
      return {
        [settings.entities.attributes[0].attribute_name]:
          anomaly_info.is_anomaly_percentage,
        [settings.entities.attributes[1].attribute_name]:
          anomaly_info.is_anomaly
            ? generatePieChartData(anomaly_info.contributing_attributes)
            : "No Anomaly Detected",
      };
    } catch (err) {
      return Promise.reject(err);
    }
  }

  // Helper functions

  async function preprocessData(data: BQDataSchema): Promise<PreprocessedData> {
    const file = ClearBladeAsync.File(
      helper.ARTIFACTS_BUCKET_SET,
      "outbox/" +
        data.asset_type_id +
        "/anomaly-detection-artifacts/features.json"
    );
    const contents = await file.read("utf8");
    const modelMeta = JSON.parse(contents.toString());
    const featuresColumns = modelMeta.features;
    const assetIdColumns = modelMeta.assetIds;

    const features = []; // stores incoming feature names
    const featuresVal = []; // stores incoming features values
    const assetIds = []; // stores incoming asset ids actual names
    const assetIdsVal = []; // stores incoming asset ids one hot coded values

    const incoming_data = [data];

    for (let i = 0; i < incoming_data.length; i++) {
      const featuresValArr = new Array(modelMeta.features.length).fill(-999);
      const featuresArr: string[] = [];
      const custom_data = JSON.parse(incoming_data[i].data);

      Object.keys(custom_data).forEach(function (key) {
        if (featuresColumns.indexOf(key) !== -1 && custom_data[key] !== null) {
          featuresValArr[featuresColumns.indexOf(key)] = custom_data[key];
          featuresArr.push(key);
        }
      });

      features.push(featuresArr);
      featuresVal.push(featuresValArr);

      const dataValArr = new Array(modelMeta.assetIds.length).fill(0);
      const dataArr: string[] = [];

      if (assetIdColumns.indexOf(incoming_data[i].asset_id) !== -1) {
        dataValArr[assetIdColumns.indexOf(incoming_data[i].asset_id)] = 1;
        dataArr.push(incoming_data[i].asset_id);
      } else {
        return Promise.reject(
          "Skipping model inferencing since model has not been trained for asset ID: " +
            data.asset_id
        );
      }

      assetIds.push(dataArr);
      assetIdsVal.push(dataValArr);
    }

    return {
      mainFeatures: featuresColumns,
      incomingFeatures: features,
      incomingFeaturesVals: featuresVal,
      incomingAssetIds: assetIds,
      incomingAssetIdsVals: assetIdsVal,
    };
  }

  function concatTensors(
    tensor1: Array<Array<number>>,
    tensor2: Array<Array<number>>
  ) {
    if (tensor1.length !== tensor2.length) {
      const msg =
        "tensor shapes should match: tensor1 length is " +
        tensor1.length +
        " and tensor2 length is " +
        tensor2.length;
      throw new Error(msg);
    }

    return tensor1.map((t, i) => t.concat(tensor2[i]));
  }

  function trimTensor(tensor: Array<Array<number>>, length: number) {
    return tensor.map((t) => t.slice(0, length));
  }

  function getAnomalyInfo(
    output: Record<string, unknown[][]>,
    input: PreprocessedData,
    output_names: CbServer.IOInfo[]
  ) {
    const anomaly_probability_perc = output[
      output_names[0].name
    ] as unknown as number[];
    const anomaly_label = output[output_names[1].name] as unknown as number[];
    const contributing_attributes = output[
      output_names[2].name
    ] as unknown as string[][];
    const contributing_attributes_perc = output[
      output_names[3].name
    ] as unknown as number[][];

    const result: AnomalyData[] = [];

    for (let i = 0; i < anomaly_label.length; i++) {
      const res: AnomalyData = {
        assetId: "",
        is_anomaly: false,
        is_anomaly_percentage: 0,
        contributing_attributes: [],
      };
      res.assetId = input.incomingAssetIds[i][0];
      res.is_anomaly = anomaly_label[i] ? true : false;
      res.is_anomaly_percentage = parseFloat(
        anomaly_probability_perc[i].toFixed(2)
      );
      res.contributing_attributes = getRelevantAttributes(
        contributing_attributes[i],
        contributing_attributes_perc[i],
        input.incomingFeaturesVals[i],
        input.mainFeatures
      );
      result.push(res);
    }

    return result;
  }

  function getRelevantAttributes(
    attributes: string[],
    attribute_perc: number[],
    incoming_features_vals: number[],
    main_features: string[]
  ) {
    const result: ContributingAttributes[] = [];
    let sum = 0;
    for (let i = 0; i < incoming_features_vals.length; i++) {
      const res: ContributingAttributes = {
        attribute: "",
        value: 0,
        contribution_percentage: 0,
      };

      if (incoming_features_vals[i] !== -999) {
        res.attribute = main_features[i];
        res.value = incoming_features_vals[i];
        res.contribution_percentage =
          attribute_perc[attributes.indexOf(main_features[i])];
        result.push(res);
      } else {
        sum += attribute_perc[attributes.indexOf(main_features[i])];
      }
    }

    for (let i = 0; i < result.length; i++) {
      result[i].contribution_percentage += sum / result.length;
      result[i].contribution_percentage = parseFloat(
        result[i].contribution_percentage.toFixed(2)
      );
    }

    return result;
  }

  function generatePieChartData(modelData: ContributingAttributes[]) {
    const pieChartData: Record<string, number> = {};
    for (const data of modelData) {
      pieChartData[data.attribute] = data.contribution_percentage;
    }
    return JSON.stringify(pieChartData);
  }

  return {
    initializeArtifacts,
    run,
  };
}

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
global.ai_components_AnomalyDetection = ai_components_AnomalyDetection;
