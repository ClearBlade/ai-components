/**
 * Type: Library
 * Description: A library that contains a function which, when called, returns an object with a public API.
 */

import { BQDataSchema } from "./types";

export function ComponentsHelper() {
  const ARTIFACTS_BUCKET_SET = "ia-components";
  const ML_PIPELINES = "ai_components_ml_pipelines";

  async function shouldInitializeArtifacts(
    id: string,
    data: BQDataSchema,
    lastInitTime: Date | undefined
  ) {
    const query = ClearBladeAsync.Query()
      .equalTo("component_id", id)
      .equalTo("asset_type_id", data.asset_type_id);
    const colResp = await ClearBladeAsync.Collection<{
      last_pipeline_run: string;
      run_frequency: string;
    }>(ML_PIPELINES).fetch(query);

    if (colResp.TOTAL === 0) {
      return { init: false, last_run: undefined }; // no pipeline found for this component
    }

    const pipelineData = colResp.DATA[0];
    if (!pipelineData.last_pipeline_run) {
      return { init: false, last_run: undefined }; // dont initialize since pipeline has not run yet
    }

    const currentDate = new Date();
    const lastRun = new Date(pipelineData.last_pipeline_run);
    const clonedDate = new Date(lastRun.getTime());

    if (
      !lastInitTime &&
      currentDate >
        new Date(clonedDate.setMinutes(clonedDate.getMinutes() + 30))
    ) {
      return { init: true, last_run: lastRun };
    }

    if (
      lastInitTime?.getTime() !== lastRun.getTime() &&
      currentDate >
        new Date(clonedDate.setMinutes(clonedDate.getMinutes() + 30))
    ) {
      console.log("Reinitializing artifacts for component: ", id);
      return { init: true, last_run: lastRun };
    }

    return { init: false, last_run: lastRun };
  }

  return {
    ARTIFACTS_BUCKET_SET,
    shouldInitializeArtifacts,
  };
}
