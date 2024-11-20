import {
  CircularProgress,
  Divider,
  FormControl,
  FormLabel,
  Grid,
  IconButton,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
} from "@material-ui/core";
import { AiComponentsProps } from "../types";
import { Autocomplete } from "@material-ui/lab";
import { Field, Form, Formik } from "formik";
import { useEffect, useState } from "react";
import HelpOutlineIcon from "@material-ui/icons/HelpOutline";
import GenerateEntityInformation from "../helpers/GenerateEntityInformation";
import { useSettings } from "./hooks/useSettings";
import React from "react";

export default function InternalComponents(
  props: AiComponentsProps & { children?: React.ReactNode }
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

  if (isLoading || isFetching) {
    return <CircularProgress />;
  }

  if (isError) {
    console.error(error);
  }

  return (
    <Formik
      initialValues={{
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
              <Grid item xs={12}>
                <FormControl fullWidth margin="normal">
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <FormLabel>
                      <Typography variant="body2">
                        <span style={{ fontWeight: "bold" }}>Attributes*</span>
                      </Typography>
                    </FormLabel>
                    <Tooltip title="This is required field. The Anomaly detection component will track anomalies for the selected attributes from this list.">
                      <IconButton
                        size="small"
                        aria-label="help"
                        style={{ marginLeft: "4px" }}
                      >
                        <HelpOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </div>
                  <Autocomplete
                    multiple
                    size="small"
                    limitTags={6}
                    id="multiple-limit-tags"
                    value={values.schema}
                    options={schema}
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

              <Grid item xs={6}>
                <FormControl fullWidth margin="normal">
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <FormLabel>
                      <Typography variant="body2">
                        <span style={{ fontWeight: "bold" }}>
                          Data Points Threshold
                        </span>
                      </Typography>
                    </FormLabel>
                    <Tooltip title="This is an optional field. It specifies the number of points after which the model training process should begin.">
                      <IconButton
                        size="small"
                        aria-label="help"
                        style={{ marginLeft: "4px" }}
                      >
                        <HelpOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </div>
                  <Field
                    size="small"
                    value={values.settings.data_threshold}
                    name="componentsMeta.data_threshold"
                    id="componentsMeta.data_threshold"
                    component={TextField}
                    variant="outlined"
                    onChange={handleChange}
                    fullWidth
                  />
                </FormControl>
              </Grid>

              <Grid item xs={6}>
                <FormControl fullWidth margin="normal">
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <FormLabel>
                      <Typography variant="body2">
                        <span style={{ fontWeight: "bold" }}>
                          Retraining Frequency
                        </span>
                      </Typography>
                    </FormLabel>
                    <Tooltip title="This is an optional field. Choose an interval after which you want to retrain the model.">
                      <IconButton
                        size="small"
                        aria-label="help"
                        style={{ marginLeft: "4px" }}
                      >
                        <HelpOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </div>
                  <Field
                    select
                    fullWidth
                    size="small"
                    value={values.settings.run_frequency}
                    name="componentsMeta.run_frequency"
                    id="componentsMeta.run_frequency"
                    component={TextField}
                    onChange={(e) => {
                      e.target.name = "componentsMeta.run_frequency";
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
              <Grid item xs={12}>
                {values.schema.length > 0 && settings && (
                  <GenerateEntityInformation
                    settings={settings}
                    componentLabel={component.name}
                    assetTypeLabel={assetTypeName}
                  />
                )}
              </Grid>
            </Grid>
          </Form>
        );
      }}
    </Formik>
  );
}
