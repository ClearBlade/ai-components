import {
  CircularProgress,
  DialogContent,
  DialogTitle,
  Snackbar,
} from "@material-ui/core";
import { Button } from "@material-ui/core";
import { Dialog, DialogActions } from "@material-ui/core";
import React, { useState } from "react";
import InternalComponents from "./InternalComponents";
import { AssetType } from "@clearblade/ia-mfe-core";
import { useCreateComponent } from "../api/useCreateComponent";
import { useUpdateComponent } from "../api/useUpdateComponent";
import { useQueryClient } from "react-query";

const SettingsDialog = ({
  open,
  setOpen,
  assetTypeName,
  schema,
  settings,
  isEditing,
  component,
}) => {
  const [mfeData, setMfeData] = useState<{
    schema: Record<string, unknown>[];
    settings?: Record<string, unknown>;
    assetType?: AssetType["backend"];
  }>({
    schema: [],
    settings: {},
    assetType: undefined,
  });
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const queryClient = useQueryClient();

  const { mutate: createComponent, isLoading: isCreatingComponent } =
    useCreateComponent({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries(["configuredComponents"]),
          queryClient.invalidateQueries(["componentEntities"]),
          queryClient.invalidateQueries(["componentSettings"]),
        ]);
        setOpen(false);
      },
      onError: (error) => {
        setError(true);
        setErrorMessage("Error: " + error.message);
      },
    });

  const { mutate: updateComponent, isLoading: isUpdatingComponent } =
    useUpdateComponent({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries(["configuredComponents"]),
          queryClient.invalidateQueries(["componentEntities"]),
          queryClient.invalidateQueries(["componentSettings"]),
        ]);
        setOpen(false);
      },
      onError: (error) => {
        setError(true);
        setErrorMessage("Error: " + error.message);
      },
    });

  return (
    <>
      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogTitle
          id="form-dialog-title"
          style={{ borderBottom: "1px solid rgba(0, 0, 0, 0.12)" }}
        >
          {isEditing ? `Edit Anomaly Detection` : `Add Anomaly Detection`}
        </DialogTitle>
        <DialogContent>
          <InternalComponents
            assetTypeName={assetTypeName}
            schema={schema}
            component={{
              id: "AnomalyDetection",
              name: "Anomaly Detection",
              settings: settings,
            }}
            setValues={setMfeData}
            isEditing={isEditing}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setOpen(false);
            }}
            color="primary"
            variant="text"
          >
            {`Cancel`}
          </Button>
          <Button
            onClick={async () => {
              const settings = {
                model_meta: mfeData.settings,
                features: mfeData.schema,
              };

              if (!mfeData.assetType) {
                setError(true);
                setErrorMessage(
                  "An asset type needs to be selected to add Anomaly Detection"
                );
                return;
              }

              if (!settings.features || settings.features.length === 0) {
                setError(true);
                setErrorMessage(
                  "Please select the attributes to track anomalies"
                );
                return;
              }

              if (isEditing) {
                await updateComponent({
                  component: component,
                  assetTypeId: mfeData.assetType.id,
                  settings: settings,
                });
              } else {
                await createComponent({
                  component: component,
                  assetTypeId: mfeData.assetType.id,
                  settings: settings,
                });
              }
            }}
            color="primary"
            variant="contained"
            disabled={isCreatingComponent || isUpdatingComponent}
          >
            {isCreatingComponent || isUpdatingComponent ? (
              <CircularProgress size={20} />
            ) : (
              "Save"
            )}
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={error}
        autoHideDuration={6000}
        onClose={() => setError(false)}
        message={errorMessage}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      />
    </>
  );
};

export default SettingsDialog;
