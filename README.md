# ia-components
This repository consists of all the available ClearBlade AI components handler libraries

## Manual Setup 

- Before you configure this component in your IA system, you'll need to setup a secret in your IA account. This secret is a GCP service account and should be named `gcp-bigquery-service-account`.   


## How to create a new AI component handler library

- Clone this repository
- Run `npm i` to install all dependencies
- Run `npm run create:ai-component --component-name <YOUR-COMPONENT-NAME>` (Note: Your component name should match the component ID in the master components collection)
- This command will generate a boilerplate code for your component handler library. Your components handler library must have 2 methods - `initializeArtifacts` and `run`. The `initializeArtifacts` is used for initializing the model artifacts and `run` will execute the models. (You can refer the AnomalyDetection component for implementation details.)  

## How to build component handler library

- Run `npm run build:library -library=<YOUR-COMPONENT-NAME>`
- This command will transpile and build your library code.
- Finally, push all your files.


# Existing ClearBlade AI Components

## ClearBlade Anomaly Detection
## <sub>Overview:</sub>
This component will facilitate the training of our custom Vertex AI Anomaly Detection model. It does so by sending asset data to BigQuery to then be used to train our model once there is enough data to get accurate results. We can do a one-time train, or retrain on a recurring basis if chosen. Once the model is complete, it is automatically exported as ONXX and put into the user’s system to run inference providing an Anomaly Score and Anomaly Breakdown score for all assets with Anomaly Detection.

## <sub>For IA Users:</sub>
IA Users can see the real time results of our anomaly detection model running inference on the attributes of assets that anomaly detection is set up for. These results are displayed as attributes for the asset. Those attributes being Anomaly Score, which is a percentage value showing how likely the model believes there is an anomaly in the current state of the asset, and Anomaly Score Breakdown which is a list of feature attributes, showing how much each one contributed to the current anomaly score. These attributes can be used in tandem with other IA features such as rules to send out notifications in the event of an anomaly.

## <sub>For IA Administrators:</sub>
From the asset type page, IA Administrators can click the gear icon to the left of the edit button in the top right corner to add a component to an asset type. Upon selecting it, they can add ClearBlade's Anomaly Detection component to the asset type so long as a ClearBlade developer has enabled the component for their system. They will be asked to specify a few things in order to set this up,
- Feature Attributes: A list of existing attributes for the asset type that you want our models to use in coming up with an anomaly score
- Run Frequency: How often the pipeline will run to retrain our anomaly detection models for your asset type. We recommend weekly.
- Data Threshold: How many data points will need to be collected for the asset type before allowing the first anomaly detection model for it to be trained. A model trained on few data points would be highly prone to inaccurate anomaly reporting, we recommend a minimum of 10,000.
Upon setting up the component, an event type, rule type, and a rule will be automatically created to fire off high anomaly score events when the Anomaly Score for an asset goes above a specified threshold. These can be modified as needed to suit the use case as desired.
