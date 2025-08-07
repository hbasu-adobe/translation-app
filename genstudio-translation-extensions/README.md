# GenStudio Translation Extension App

This is a sample extension for the Translation extension point in Adobe GenStudio for Performance Marketing. It supports multiple translation services that you can easily switch between using a simple environment variable.

## Easy Service Switching

Set the `TRANSLATION_SERVICE` environment variable to choose your translation service:

- `TRANSLATION_SERVICE=azure` - Use Azure OpenAI (default)
- `TRANSLATION_SERVICE=google` - Use Google Translate API
- `TRANSLATION_SERVICE=openai` - Use OpenAI
- `TRANSLATION_SERVICE=deepl` - Use DeepL API

## Google Translate Configuration

Set these environment variables for Google Translate:

- GOOGLE_TRANSLATE_API_KEY
- GOOGLE_CLOUD_PROJECT_ID

## OpenAI Configuration

Set these environment variables for OpenAI:

- OPENAI_API_KEY
- OPENAI_MODEL (e.g., "gpt-4o", "gpt-4", "gpt-3.5-turbo")

## Azure OpenAI Configuration

Set these environment variables for Azure OpenAI:

- AZURE_OPENAI_API_KEY
- AZURE_OPENAI_ENDPOINT
- AZURE_OPENAI_DEPLOYMENT_NAME
- AZURE_OPENAI_API_VERSION

## DeepL Configuration

Set these environment variables for DeepL:

- DEEPL_API_KEY

**Note**: DeepL has limited language support compared to other services. Currently supported: French, German, Italian, Spanish, Dutch, Japanese. Languages like Thai will be automatically skipped when using DeepL.

Translation is a backend-only extension, which consists of only I/O actions (no UI components).

Developers MUST NOT update the app.config.yaml configuration file. The given structure and naming convention is key to using this extension point.

### Required actions
1. Get locales - Fetch the list of locales the extension supports for translation
2. Translate - Invokes the custom translation engine

For response structure that the extension sends back to GenStudio, it is necessary to use the types defined in [@adobe/genstudio-extensibility-sdk.](https://github.com/adobe/genstudio-extensibility-sdk/tree/main/src/types/translation)

## Setup

- Populate the `.env` file in the project root and fill it as shown [below](#env)

## Local Dev

- `aio app run` to start your local Dev server
- App will run on `localhost:9080` by default

By default the UI will be served locally but actions will be deployed and served from Adobe I/O Runtime. To start a
local serverless stack and also run your actions locally use the `aio app run --local` option.

## Test & Coverage

- Run `aio app test` to run unit tests for ui and actions
- Run `aio app test --e2e` to run e2e tests

## Deploy & Cleanup

- `aio app deploy` to build and deploy all actions on Runtime and static files to CDN
- `aio app undeploy` to undeploy the app

## Logging
See [I/O Runtime Logging](https://developer.adobe.com/app-builder/docs/guides/runtime-logging/)

## Config

### `.env`

You can generate this file using the command `aio app use`. 

```bash
# This file must **not** be committed to source control

## please provide your Adobe I/O Runtime credentials
# AIO_RUNTIME_AUTH=
# AIO_RUNTIME_NAMESPACE=

## Translation Service Selection (azure, google, openai, deepl)
# TRANSLATION_SERVICE=azure

## Google Translate Configuration
# GOOGLE_TRANSLATE_API_KEY=your-google-translate-api-key
# GOOGLE_CLOUD_PROJECT_ID=your-google-cloud-project-id

## OpenAI Configuration
# OPENAI_API_KEY=your-openai-api-key
# OPENAI_MODEL=gpt-4o

## Azure OpenAI Configuration
# AZURE_OPENAI_API_KEY=your-azure-openai-key
# AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
# AZURE_OPENAI_DEPLOYMENT_NAME=your-deployment-name
# AZURE_OPENAI_API_VERSION=2024-02-01
```

### Switching Services

To switch translation services, simply change the `TRANSLATION_SERVICE` value in your `.env` file:

**For Azure OpenAI (default):**
```bash
TRANSLATION_SERVICE=azure
AZURE_OPENAI_API_KEY=your-key
AZURE_OPENAI_ENDPOINT=your-endpoint
AZURE_OPENAI_DEPLOYMENT_NAME=your-deployment
AZURE_OPENAI_API_VERSION=2024-02-01
```

**For Google Translate:**
```bash
TRANSLATION_SERVICE=google
GOOGLE_TRANSLATE_API_KEY=your-key
GOOGLE_CLOUD_PROJECT_ID=your-project
```

**For OpenAI:**
```bash
TRANSLATION_SERVICE=openai
OPENAI_API_KEY=your-key
OPENAI_MODEL=gpt-4o
```

**For DeepL:**
```bash
TRANSLATION_SERVICE=deepl
DEEPL_API_KEY=your-deepl-key
```

### `app.config.yaml`

- Main configuration file that defines an application's implementation. 
- More information on this file, application configuration, and extension configuration 
  can be found [here](https://developer.adobe.com/app-builder/docs/guides/appbuilder-configuration/#appconfigyaml)

#### Action Dependencies

- You have two options to resolve your actions' dependencies:

  1. **Packaged action file**: Add your action's dependencies to the root
   `package.json` and install them using `npm install`. Then set the `function`
   field in `app.config.yaml` to point to the **entry file** of your action
   folder. We will use `webpack` to package your code and dependencies into a
   single minified js file. The action will then be deployed as a single file.
   Use this method if you want to reduce the size of your actions.

  2. **Zipped action folder**: In the folder containing the action code add a
     `package.json` with the action's dependencies. Then set the `function`
     field in `app.config.yaml` to point to the **folder** of that action. We will
     install the required dependencies within that directory and zip the folder
     before deploying it as a zipped action. Use this method if you want to keep
     your action's dependencies separated.

## Debugging in VS Code

While running your local server (`aio app run`), both UI and actions can be debugged, to do so open the vscode debugger
and select the debugging configuration called `WebAndActions`.
Alternatively, there are also debug configs for only UI and each separate action.

## Typescript support for UI

To use typescript use `.tsx` extension for react components and add a `tsconfig.json` 
and make sure you have the below config added
```
 {
  "compilerOptions": {
      "jsx": "react"
    }
  } 
```
