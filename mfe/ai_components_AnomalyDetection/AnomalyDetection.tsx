import { AiComponentsProps } from "../types";
import InternalComponents from "../helpers/InternalComponents";
import React from "react";
import AnomalyDetectionDetails from "../ai_components_AnomalyDetection_details/AnomalyDetectionDetails";

export default function AnomalyDetection(props: AiComponentsProps) {
  const { assetTypeName } = props;
  if (assetTypeName) {
    return <InternalComponents {...props} />;
  }
  return <AnomalyDetectionDetails {...props} />;
}
