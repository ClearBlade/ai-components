const PROJECT_ID = "clearblade-ipm";
const DATASET_ID = "clearblade_components";
const TABLE_ID = cbmeta.system_key;
const LOCATION = "us-central1";
const VERTEX_AI_ENDPOINT = `https://${LOCATION}-aiplatform.googleapis.com/v1`;
const TEMPLATE_URI =
  "https://us-central1-kfp.pkg.dev/clearblade-ipm/cb-ml-pipelines/anomaly-detection-pipeline-template/sha256:970dd968af79c09c64a14233783f3fb37adb5b03c726622459919a01fbfda206";
const OUTPUT_DIRECTORY = "gs://clearblade-components/pipeline";

interface QueryResponse {
  schema: object;
  totalRows: string;
  rows: { f: { v: number }[] }[];
  [key: string]: string | object;
}

export interface PipelineData {
  asset_type_id: string;
  component_id: string;
  feature_attributes: string[];
  data_threshold?: number;
  run_frequency?: RunFrequency;
  pipeline_run_id?: {
    current_run: string;
    last_run: string;
  };
  last_pipeline_run?: string;
}

export enum RunFrequency {
  HOURLY = "Hourly",
  NEVER = "Never",
  WEEKLY = "Weekly",
  TWICE_A_MONTH = "Twice a Month",
  MONTHLY = "Monthly",
  EVERY_OTHER_MONTH = "Every Other Month",
}

export const getPipelines = async (): Promise<PipelineData[]> => {
  const col = ClearBladeAsync.Collection<PipelineData>({
    collectionName: "ai_components_ml_pipelines",
  });
  const data = await col.fetch(ClearBladeAsync.Query());
  if (data.TOTAL === 0) return [];
  return data.DATA;
};

export const isThresholdMet = async (
  attributes: string[],
  assetTypeId: string,
  dataThreshold: number
): Promise<boolean> => {
  //check that the data threshold is met for all given attributes
  try {
    const query = constructAttributeQuery(attributes, assetTypeId); //already tested, works fine

    const allSubscriptions = await AccessTokenCache()
      .getAll()
      .catch((err) => Promise.reject({ error: true, message: err }));
    const bigQueryToken =
      allSubscriptions["google-bigquery-config"].accessToken;

    if (!bigQueryToken) {
      throw new Error(
        "BigQuery Token is undefined or empty. Please check the subscription 'google-bigquery-config'."
      );
    }

    const queryRequest = {
      query: query,
      maxResults: 1,
      defaultDataset: {
        projectId: PROJECT_ID,
        datasetId: DATASET_ID,
      },
      timeoutMs: 60000,
      useLegacySql: false,
    };

    //Run the query job
    const jobResponse = await fetch(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${PROJECT_ID}/queries`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${bigQueryToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(queryRequest),
      }
    );
    if (!jobResponse.ok) {
      throw new Error(`Error in running query job: ${jobResponse.text()}`);
    }
    const result = jobResponse.json() as QueryResponse;
    return Number(result.rows[0].f[0].v) >= dataThreshold;
  } catch (error) {
    console.error("Error:", error);
    return false;
  }
};

export const shouldRunPipeline = (pipeline: PipelineData): boolean => {
  if (!pipeline.last_pipeline_run) {
    return true;
  }
  const currentDate = new Date();
  const lastRun = new Date(pipeline.last_pipeline_run);
  switch (pipeline.run_frequency) {
    case RunFrequency.HOURLY: {
      const nextRun = new Date(lastRun.setHours(lastRun.getHours() + 1));
      return nextRun < currentDate;
    }
    case RunFrequency.WEEKLY: {
      const nextRun = new Date(lastRun.setDate(lastRun.getDate() + 7));
      return nextRun < currentDate;
    }
    case RunFrequency.TWICE_A_MONTH: {
      let nextRun = new Date(lastRun.setDate(lastRun.getDate() + 14));
      nextRun =
        nextRun.getDate() < 29
          ? nextRun
          : new Date(nextRun.setMonth(nextRun.getMonth() + 1, 1));
      return nextRun < currentDate;
    }
    case RunFrequency.MONTHLY: {
      const nextRun = new Date(lastRun.setMonth(lastRun.getMonth() + 1));
      return nextRun < currentDate;
    }
    case RunFrequency.EVERY_OTHER_MONTH: {
      const nextRun = new Date(lastRun.setMonth(lastRun.getMonth() + 2));
      return nextRun < currentDate;
    }
    default:
      return false;
  }
};

const constructAttributeQuery = (
  attributes: string[],
  assetTypeId: string
): string => {
  if (attributes.length === 0) {
    throw new Error("Attributes cannot be empty");
  }
  //Escape single quotes in assetTypeId to prevent SQL injection
  const escapedAssetTypeId = assetTypeId.replace(/'/g, "''");

  //Create individual regex patterns for each attribute
  const attributePatterns = attributes
    .map((attr) => `REGEXP_CONTAINS(data, r'"${attr}":')`)
    .join(" AND ");

  const query = `
    SELECT COUNT(*) as row_count
    FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`
    WHERE asset_type_id = '${escapedAssetTypeId}'
      AND ${attributePatterns}`;

  return query;
};

export const startPipeline = async (
  row: PipelineData
): Promise<{ error: boolean; message: string }> => {
  const response: { error: boolean; message: string } = {
    error: true,
    message: "",
  };

  try {
    const allSubscriptions = await AccessTokenCache()
      .getAll()
      .catch((err) => Promise.reject({ error: true, message: err }));
    const bigQueryToken =
      allSubscriptions["google-bigquery-config"].accessToken;

    if (!bigQueryToken) {
      throw new Error(
        "Vertex AI Token is undefined or empty. Please check the subscription 'google-vertex-ai-config'."
      );
    }
    //get the current day of the week as an integer

    const pipelineConfig = {
      displayName: `clearblade-component-pipeline-job-${TABLE_ID}-${row.asset_type_id}`,
      runtimeConfig: {
        gcsOutputDirectory: OUTPUT_DIRECTORY,
        parameterValues: {
          asset_type_id: row.asset_type_id,
          features: row.feature_attributes,
          system_key: cbmeta.system_key,
        },
      },
      serviceAccount: "bigqueryadmin@clearblade-ipm.iam.gserviceaccount.com",
      templateUri: TEMPLATE_URI,
    };

    const pipelineResponse = await fetch(
      `${VERTEX_AI_ENDPOINT}/projects/${PROJECT_ID}/locations/${LOCATION}/pipelineJobs`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${bigQueryToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(pipelineConfig),
      }
    );

    if (!pipelineResponse.ok) {
      const errorText = pipelineResponse.text();
      throw new Error(`Error in creating pipeline job: ${errorText}`);
    }

    const pipelineResult = (await pipelineResponse.json()) as {
      name: string;
      [key: string]: string | object;
    };

    response.error = false;
    response.message = `Recurring pipeline created successfully. Pipeline Job ID: ${pipelineResult.name}`;
    return response;
  } catch (error) {
    response.message = error + JSON.stringify(error);
    console.error("Error:", error);
    return response;
  }
};

export const killPipeline = async (
  pipelineRunId: string
): Promise<{ error: boolean; message: string }> => {
  const response: { error: boolean; message: string } = {
    error: true,
    message: "",
  };
  if (!pipelineRunId) {
    response.error = false;
    response.message = "No existing Pipeline to delete.";
    return response;
  }
  try {
    const allSubscriptions = await AccessTokenCache()
      .getAll()
      .catch((err) => Promise.reject({ error: true, message: err }));
    const bigQueryToken =
      allSubscriptions["google-bigquery-config"].accessToken;

    if (!bigQueryToken) {
      throw new Error(
        "Vertex AI Token is undefined or empty. Please check the subscription 'google-vertex-ai-config'."
      );
    }

    const killResponse = await fetch(
      `${VERTEX_AI_ENDPOINT}/projects/${PROJECT_ID}/locations/${LOCATION}/pipelineJobs/${pipelineRunId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${bigQueryToken}`,
        },
      }
    );

    if (!killResponse.ok) {
      const errorText = killResponse.text();
      if (Number(JSON.parse(errorText).error.code) === 404) {
        //if the pipeline job doesn't exist, then there is no need to delete it so we can treat it as a success
        response.error = false;
        response.message = "No existing Pipeline Job to delete.";
        return response;
      }
      throw new Error(`Error in deleting Pipeline Job: ${errorText}`);
    }

    response.error = false;
    response.message = "Pipeline deleted successfully";
    return response;
  } catch (error) {
    response.message = error + JSON.stringify(error);
    console.error("Error:", error);
    return response;
  }
};

export const updatePipelineRows = async (
  rows: PipelineData[]
): Promise<void> => {
  const col = ClearBladeAsync.Collection({
    collectionName: "ai_components_ml_pipelines",
  });
  const promises = rows.map((row) => {
    return col.update(
      ClearBladeAsync.Query().equalTo("asset_type_id", row.asset_type_id),
      row
    );
  });
  await Promise.all(promises);
};

export const deletePipelineRow = async (assetTypeId: string): Promise<void> => {
  const col = ClearBladeAsync.Collection({
    collectionName: "ai_components_ml_pipelines",
  });
  await col.remove(
    ClearBladeAsync.Query().equalTo("asset_type_id", assetTypeId)
  );
};

export interface SubscriptionConfig {
  CB_FORWARD_TOPIC: string;
  FORWARD_TO_CB_TOPIC: boolean;
  accessToken: string;
  maxMessages: number;
  pullUrl: string;
  ackUrl: string;
  subscriptionType: string;
}

const cacheName = "AccessTokenCache";

const AccessTokenCache = (asyncClient = ClearBladeAsync) => {
  const cache = asyncClient.Cache<SubscriptionConfig>(cacheName);

  return {
    getAll: () => cache.getAll(),
    set: (subscriptionID: string, data: SubscriptionConfig) =>
      cache.set(subscriptionID, data),
  };
};
