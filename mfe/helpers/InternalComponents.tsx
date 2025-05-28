import {
  Divider,
  FormControl,
  FormLabel,
  Grid,
  IconButton,
  LinearProgress,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
} from "@material-ui/core";
import { AiComponentsProps } from "../types";
import { Autocomplete } from "@material-ui/lab";
import { Field, Form, Formik } from "formik";
import { useEffect, useState } from "react";
import HelpIcon from "@material-ui/icons/Help";
import GenerateEntityInformation from "../helpers/GenerateEntityInformation";
import { useSettings } from "./hooks/useSettings";
import React from "react";
import { useFetchAssetTypes } from "../api/useFetchAssetTypes";
import { AssetType } from "@clearblade/ia-mfe-core";

export default function InternalComponents(
  props: AiComponentsProps & { children?: React.ReactNode; isEditing?: boolean }
) {
  const { schema, component, assetTypeName, setValues } = props;
  const frequencyOptions = [
    "Never",
    "Weekly",
    "Twice a Month",
    "Monthly",
    "Every Other Month",
  ];
  const {
    data: settings,
    isLoading,
    isFetching,
    isError,
    error,
  } = useSettings(component.id);
  const [schemaOptions, setSchemaOptions] = useState(schema);
  const { data: assetTypes, isLoading: assetTypesLoading } =
    useFetchAssetTypes();

  // if (isLoading || isFetching || assetTypesLoading) {
  //   return <LinearProgress variant="indeterminate" />;
  // }

  if (isError) {
    console.error(error);
    return <Typography>Error loading MFE</Typography>;
  }

  return (
    <Formik
      initialValues={{
        assetType: { id: assetTypeName || "" } as AssetType["backend"],
        schema: schema.filter((attribute) => attribute.selected),
        settings: {
          data_threshold: component.settings["data_threshold"] ?? 100000,
          run_frequency: component.settings["run_frequency"] ?? "Never",
        },
      }}
      onSubmit={() => {}}
    >
      {({ values, setFieldValue, handleChange }) => {
        useEffect(() => {
          setValues((v) => ({ ...v, ...values }));
        }, [values]);

        return (
          <Form>
            <Grid container spacing={2}>
              {assetTypeName === "" && assetTypes && (
                <Grid item xs={12}>
                  <FormControl fullWidth margin="normal">
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        marginBottom: "4px",
                      }}
                    >
                      <FormLabel>
                        <Typography
                          variant="body2"
                          style={{ fontWeight: "bold" }}
                        >
                          Asset type*
                        </Typography>
                      </FormLabel>
                      <Tooltip title="This is required field. The Anomaly detection component will track anomalies for the selected asset type from this list.">
                        <IconButton
                          size="small"
                          aria-label="help"
                          style={{ marginLeft: "8px" }}
                        >
                          <HelpIcon style={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    </div>
                    <Field
                      select
                      fullWidth
                      size="small"
                      value={values.assetType?.id || ""}
                      name="assetType"
                      id="assetType"
                      component={TextField}
                      onChange={(e) => {
                        const selectedAssetType = assetTypes.find(
                          (assetType) => assetType.id === e.target.value
                        );
                        if (selectedAssetType) {
                          setFieldValue("assetType", selectedAssetType);
                          const schema = JSON.parse(
                            selectedAssetType.schema
                          ).filter(
                            (attribute) => attribute.attribute_type === "number"
                          );
                          setSchemaOptions(schema);
                          setFieldValue("schema", []);
                        }
                      }}
                      variant="outlined"
                    >
                      {assetTypes.map((option) => (
                        <MenuItem value={option.id} key={option.id}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </Field>
                  </FormControl>
                </Grid>
              )}

              <Grid item xs={12}>
                <FormControl fullWidth margin="normal">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      marginBottom: "4px",
                    }}
                  >
                    <FormLabel>
                      <Typography variant="body2">
                        <span style={{ fontWeight: "bold" }}>Attributes*</span>
                      </Typography>
                    </FormLabel>
                    <Tooltip title="This is required field. The Anomaly detection component will track anomalies for the selected attributes from this list.">
                      <IconButton
                        size="small"
                        aria-label="help"
                        style={{ marginLeft: "8px" }}
                      >
                        <HelpIcon style={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  </div>
                  <Autocomplete
                    multiple
                    size="small"
                    limitTags={6}
                    id="multiple-limit-tags"
                    value={values.schema}
                    options={schemaOptions}
                    onChange={(event, newValue) =>
                      setFieldValue("schema", newValue)
                    }
                    getOptionSelected={(option, value) =>
                      option.uuid === value.uuid
                    }
                    getOptionLabel={(option) =>
                      (option.attribute_label as string) ||
                      (option.attribute_name as string)
                    }
                    renderInput={(params) => (
                      <TextField {...params} variant="outlined" />
                    )}
                    disableCloseOnSelect
                  />
                </FormControl>
              </Grid>

              <Grid item xs={12}>
                <Divider />
              </Grid>

              <Grid item xs={12}>
                <Typography variant="body1" style={{ fontWeight: "bold" }}>
                  Model Training Settings
                </Typography>
              </Grid>

              <Grid item md={6} xs={12}>
                <FormControl fullWidth margin="normal">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      marginBottom: "4px",
                    }}
                  >
                    <FormLabel>
                      <Typography
                        variant="body2"
                        style={{ fontWeight: "bold" }}
                      >
                        Min data points required
                      </Typography>
                    </FormLabel>
                    <Tooltip title="This is an optional field. It specifies the number of points after which the model training process should begin.">
                      <IconButton
                        size="small"
                        aria-label="help"
                        style={{ marginLeft: "8px" }}
                      >
                        <HelpIcon style={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  </div>
                  <Field
                    size="small"
                    value={values.settings.data_threshold}
                    name="settings.data_threshold"
                    id="settings.data_threshold"
                    component={TextField}
                    variant="outlined"
                    onChange={handleChange}
                    fullWidth
                  />
                </FormControl>
              </Grid>

              <Grid item md={6} xs={12}>
                <FormControl fullWidth margin="normal">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      marginBottom: "4px",
                    }}
                  >
                    <FormLabel>
                      <Typography
                        variant="body2"
                        style={{ fontWeight: "bold" }}
                      >
                        Retraining frequency
                      </Typography>
                    </FormLabel>
                    <Tooltip title="This is an optional field. Choose an interval after which you want to retrain the model.">
                      <IconButton
                        size="small"
                        aria-label="help"
                        style={{ marginLeft: "8px" }}
                      >
                        <HelpIcon style={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  </div>
                  <Field
                    select
                    fullWidth
                    size="small"
                    value={values.settings.run_frequency}
                    name="settings.run_frequency"
                    id="settings.run_frequency"
                    component={TextField}
                    onChange={(e) => {
                      e.target.name = "settings.run_frequency";
                      handleChange(e);
                    }}
                    variant="outlined"
                  >
                    {frequencyOptions.map((option) => (
                      <MenuItem value={option} key={option}>
                        {option}
                      </MenuItem>
                    ))}
                  </Field>
                </FormControl>
              </Grid>
              {props.children}
              {values.schema.length > 0 && settings && (
                <>
                  <Grid item xs={12}>
                    <Divider />
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="body1" style={{ fontWeight: "bold" }}>
                      Summary
                    </Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <GenerateEntityInformation
                      settings={settings}
                      componentLabel={component.name}
                      assetTypeLabel={
                        assetTypeName || values.assetType?.label || ""
                      }
                      isEditing={props.isEditing}
                    />
                  </Grid>
                </>
              )}
            </Grid>
          </Form>
        );
      }}
    </Formik>
  );
}
