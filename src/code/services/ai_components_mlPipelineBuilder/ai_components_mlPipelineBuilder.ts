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

import {
  isThresholdMet,
  startPipeline,
  deletePipelineRow,
  getPipelines,
  killPipeline,
  updatePipelineRows,
  shouldRunPipeline,
} from "./utils";

async function ai_components_mlPipelineBuilder(
  _: CbServer.BasicReq,
  resp: CbServer.Resp
) {
  console.log("Building pipelines...");
  const pipelines = await getPipelines();
  const rows = [];
  for (const row of pipelines) {
    try {
      if (!row.feature_attributes || row.feature_attributes.length === 0) {
        const results = await Promise.all([
          killPipeline(row.pipeline_run_id?.current_run || ""),
          killPipeline(row.pipeline_run_id?.last_run || ""),
        ]);
        if (results[0].error) {
          console.error(
            "Error killing current pipeline for",
            row.asset_type_id,
            ": ",
            JSON.stringify(results)
          );
          continue;
        }
        if (results[1].error) {
          console.error(
            "Error killing last pipeline for",
            row.asset_type_id,
            ": ",
            JSON.stringify(results)
          );
          continue;
        }
        //then delete the row from the ml_pipelines collection
        await deletePipelineRow(row.asset_type_id);
        continue;
      }
      const check = await isThresholdMet(
        row.feature_attributes,
        row.asset_type_id,
        row.data_threshold !== undefined ? row.data_threshold : 100000
      );

      if (!check || !shouldRunPipeline(row)) {
        continue;
      }

      if (row.pipeline_run_id?.last_run) {
        const killResults = await killPipeline(row.pipeline_run_id.last_run);
        if (killResults.error) {
          console.error(
            "Error killing pipeline for",
            row.asset_type_id,
            ": ",
            killResults.message
          );
          continue;
        }
        row.pipeline_run_id.last_run = "";
      }
      const results = await startPipeline(row);
      if (results.error) {
        console.error(
          "Error creating pipeline for",
          row.asset_type_id,
          ": ",
          JSON.stringify(results)
        );
      } else {
        if (!row.pipeline_run_id)
          row.pipeline_run_id = { current_run: "", last_run: "" };
        row.pipeline_run_id.last_run = row.pipeline_run_id.current_run;
        row.pipeline_run_id.current_run =
          results.message.split("/pipelineJobs/")[1];
        row.last_pipeline_run = new Date().toString();
      }
      row.data_threshold = row.data_threshold || 100000;
      console.log(results.message);
      rows.push(row);
    } catch (error) {
      console.error("Error building pipeline: ", error);
    }
  }

  console.log(
    rows.length,
    "pipelines started: ",
    rows.map((r) => `${r.component_id}::${r.asset_type_id}`).join(", ")
  );
  //then we need to update the rows back in the ml_pipelines collection
  try {
    if (rows.length > 0) await updatePipelineRows(rows);
  } catch (error) {
    console.error("Error updating rows: ", error);
  }
  resp.success("Success");
}

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
global.ai_components_mlPipelineBuilder = ai_components_mlPipelineBuilder;
