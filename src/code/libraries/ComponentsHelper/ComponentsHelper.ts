/**
 * Type: Library
 * Description: A library that contains a function which, when called, returns an object with a public API.
 */

import { RunFrequency } from "src/code/services/ai_components_mlPipelineBuilder/utils";
import { BQDataSchema } from "./types";

export function ComponentsHelper() {
  const ARTIFACTS_BUCKET_SET = "ia-components";
  const ML_PIPELINES = "ai_components_ml_pipelines";

  async function shouldReInitializeArtifacts(id: string, data: BQDataSchema) {
    const query = ClearBladeAsync.Query()
      .equalTo("component_id", id)
      .equalTo("asset_type_id", data.asset_type_id);
    const colResp = await ClearBladeAsync.Collection<{
      last_pipeline_run: string;
      init_artifacts: boolean;
      run_frequency: string;
    }>(ML_PIPELINES).fetch(query);

    if (colResp.TOTAL === 0) {
      return false; // no pipeline found for this component
    }

    const pipelineData = colResp.DATA[0];
    if (!pipelineData.last_pipeline_run) {
      return false; // dont initialize since pipeline has not run yet
    }

    if (pipelineData.run_frequency === RunFrequency.NEVER) {
      return false; // dont initialize since pipeline is set to never run again
    }

    const currentDate = new Date();
    const lastRun = new Date(pipelineData.last_pipeline_run);

    switch (pipelineData.run_frequency) {
      case RunFrequency.HOURLY: {
        const nextRun = new Date(lastRun.setHours(lastRun.getHours() + 1));
        return (
          currentDate > new Date(nextRun.setMinutes(nextRun.getMinutes() + 30))
        );
      }
      case RunFrequency.WEEKLY: {
        const nextRun = new Date(lastRun.setDate(lastRun.getDate() + 7));
        return (
          currentDate > new Date(nextRun.setMinutes(nextRun.getMinutes() + 30))
        );
      }
      case RunFrequency.TWICE_A_MONTH: {
        let nextRun = new Date(lastRun.setDate(lastRun.getDate() + 14));
        nextRun =
          nextRun.getDate() < 29
            ? nextRun
            : new Date(nextRun.setMonth(nextRun.getMonth() + 1, 1));
        return (
          currentDate > new Date(nextRun.setMinutes(nextRun.getMinutes() + 30))
        );
      }
      case RunFrequency.MONTHLY: {
        const nextRun = new Date(lastRun.setMonth(lastRun.getMonth() + 1));
        return (
          currentDate > new Date(nextRun.setMinutes(nextRun.getMinutes() + 30))
        );
      }
      case RunFrequency.EVERY_OTHER_MONTH: {
        const nextRun = new Date(lastRun.setMonth(lastRun.getMonth() + 2));
        return (
          currentDate > new Date(nextRun.setMinutes(nextRun.getMinutes() + 30))
        );
      }
      default:
        return false;
    }
  }

  return {
    ARTIFACTS_BUCKET_SET,
    shouldReInitializeArtifacts,
  };
}
