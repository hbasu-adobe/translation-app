/*
 * Copyright 2025 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

const { Core } = require('@adobe/aio-sdk')
const { stringParameters, errorResponse } = require('./utils')
// Import all translation services
const { Translate } = require('@google-cloud/translate').v2;
const { OpenAI } = require('openai');
const { AzureOpenAI } = require('openai');
const axios = require('axios');

/**
 * @typedef {import('@adobe/genstudio-extensibility-sdk').TranslationResponse} TranslationResponse
 * @typedef {import('@adobe/genstudio-extensibility-sdk').TranslationItem} TranslationItem
 * @typedef {import('@adobe/genstudio-extensibility-sdk').TranslationMessage} TranslationMessage
 */

// OpenAI-specific constants
const SYSTEM_PROMPT = `
  You are a translation assistant. Always respond in provided JSON schema.
  Translate only the 'text' field from the source language to the target language.
  Preserve message IDs and do not modify keys.
  Preserve meaning and make it sound like a marketing slogan.
  No extra text. No comments.
`;

const OPENAI_TRANSLATION_RESPONSE_SCHEMA = {
  name: 'openai_translation_response',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      targetLocale: { type: 'string' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            messages: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  value: { type: 'string' },
                },
                required: ['id', 'value'],
                additionalProperties: false,
              },
            },
          },
          required: ['id', 'messages'],
          additionalProperties: false,
        },
      },
    },
    required: ['targetLocale', 'items'],
    additionalProperties: false,
  },
};

/**
 * Validates required environment variables based on translation service
 * @param {Object} params - Request parameters
 * @param {Object} logger - Logger instance
 * @returns {Object|null} Error response if validation fails, null if valid
 */
const validateEnvironment = (params, logger) => {
  const service = params.TRANSLATION_SERVICE || 'azure';
  let requiredVars = [];
  
  logger.info(`🔍 ENVIRONMENT VALIDATION - Service: ${service}`);
  
  switch (service.toLowerCase()) {
    case 'google':
      requiredVars = ['GOOGLE_TRANSLATE_API_KEY', 'GOOGLE_CLOUD_PROJECT_ID'];
      break;
    case 'openai':
      requiredVars = ['OPENAI_API_KEY', 'OPENAI_MODEL'];
      break;
    case 'azure':
      requiredVars = ['AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_API_VERSION', 'AZURE_OPENAI_DEPLOYMENT_NAME'];
      break;
    case 'deepl':
      requiredVars = ['DEEPL_API_KEY'];
      break;
    default:
      logger.error(`❌ Unsupported translation service: ${service}. Supported: google, openai, azure, deepl`);
      return errorResponse(500, `Unsupported translation service: ${service}`, logger);
  }
  
  logger.info(`📋 Required variables for ${service}:`, requiredVars);
  
  // Check each variable and log its status
  const variableStatus = {};
  requiredVars.forEach(varName => {
    const value = params[varName];
    variableStatus[varName] = value ? 'SET' : 'MISSING';
    if (value) {
      // Only log first few characters for security
      const maskedValue = value.length > 10 ? value.substring(0, 10) + '...' : value;
      logger.info(`✅ ${varName}: ${maskedValue}`);
    } else {
      logger.error(`❌ ${varName}: MISSING`);
    }
  });
  
  const missing = requiredVars.filter(varName => !params[varName]);
  
  if (missing.length > 0) {
    logger.error('💥 Missing required environment variables:', missing);
    logger.error('🔧 Variable status:', variableStatus);
    return errorResponse(500, `Missing required environment variables for ${service}: ${missing.join(', ')}`, logger);
  }
  
  logger.info(`✅ All required environment variables present for ${service}`);
  return null;
};

/**
 * Extracts parameters from request body or params
 * @param {Object} params - Request parameters
 * @param {Object} logger - Logger instance
 * @returns {Object} Extracted parameters or error response
 */
const extractParameters = (params, logger) => {
  let sourceLocale, targetLocales, items;
  
  if (params.__ow_body) {
    try {
      const body = JSON.parse(params.__ow_body);
      sourceLocale = body.sourceLocale;
      targetLocales = body.targetLocales;
      items = body.items;
    } catch (parseError) {
      logger.error('Failed to parse JSON body:', parseError);
      return { error: errorResponse(400, 'Invalid JSON in request body', logger) };
    }
  } else {
    sourceLocale = params.sourceLocale;
    targetLocales = params.targetLocales;
    items = params.items;
  }

  return { sourceLocale, targetLocales, items };
};

/**
 * Validates required parameters
 * @param {string} sourceLocale - Source locale
 * @param {Array} targetLocales - Target locales
 * @param {Array} items - Items to translate
 * @param {Object} logger - Logger instance
 * @returns {Object|null} Error response if validation fails, null if valid
 */
const validateParameters = (sourceLocale, targetLocales, items, logger) => {
  if (!sourceLocale) {
    return errorResponse(400, 'sourceLocale is required', logger);
  }
  
  if (!Array.isArray(targetLocales) || targetLocales.length === 0) {
    return errorResponse(400, 'targetLocales must be a non-empty array', logger);
  }
  
  if (!Array.isArray(items) || items.length === 0) {
    return errorResponse(400, 'items must be a non-empty array', logger);
  }

  return null;
};

/**
 * Creates translation client based on service type
 * @param {Object} params - Request parameters
 * @returns {Object} Translation client instance
 */
const createTranslationClient = (params) => {
  const service = params.TRANSLATION_SERVICE || 'azure';
  
  switch (service.toLowerCase()) {
    case 'google':
      return {
        type: 'google',
        client: new Translate({
          key: params.GOOGLE_TRANSLATE_API_KEY,
          projectId: params.GOOGLE_CLOUD_PROJECT_ID,
        })
      };
    case 'deepl':
      const deeplClient = {
        apiKey: params.DEEPL_API_KEY,
        baseURL: params.DEEPL_API_KEY?.includes(':fx') ? 'https://api-free.deepl.com/v2' : 'https://api.deepl.com/v2'
      };
      
      return {
        type: 'deepl',
        client: deeplClient
      };
    case 'openai':
      return {
        type: 'openai',
        client: new OpenAI({
          apiKey: params.OPENAI_API_KEY,
          timeout: 30000,
        })
      };
    case 'azure':
      return {
        type: 'azure',
        client: new AzureOpenAI({
          apiKey: params.AZURE_OPENAI_API_KEY,
          endpoint: params.AZURE_OPENAI_ENDPOINT,
          apiVersion: params.AZURE_OPENAI_API_VERSION,
          timeout: 30000,
        })
      };
    default:
      throw new Error(`Unsupported translation service: ${service}`);
  }
};



/**
 * Converts locale code to language code for Google Translate
 * @param {string} locale - Locale code (e.g., 'fr-FR', 'en-US')
 * @returns {string} Language code (e.g., 'fr', 'en')
 */
const convertLocaleToLanguageCode = (locale) => {
  // Extract language code from locale (fr-FR -> fr, en-US -> en, etc.)
  return locale.split('-')[0];
};



/**
 * Calls Google Translate API for translation
 * @param {Translate} client - Google Translate client
 * @param {string} text - Text to translate
 * @param {string} targetLocale - Target locale
 * @returns {string} Translated text
 */
const callGoogleTranslateAPI = async (client, text, targetLocale) => {
  const logger = Core.Logger('callGoogleTranslateAPI', { level: 'info' });
  const languageCode = convertLocaleToLanguageCode(targetLocale);
  
  logger.debug(`🌎 GOOGLE TRANSLATE API CALL - Text: "${text}" -> Language: ${languageCode} (from ${targetLocale})`);
  
  try {
    const [translation] = await client.translate(text, languageCode);
    logger.debug(`✅ Google Translate success: "${text}" -> "${translation}"`);
    return translation;
  } catch (error) {
    logger.error(`❌ Google Translate API call failed:`, error);
    throw error;
  }
};

/**
 * Calls DeepL API for translation
 * @param {Object} client - DeepL client configuration
 * @param {string} text - Text to translate
 * @param {string} targetLocale - Target locale
 * @returns {string} Translated text
 */
const callDeepLTranslationAPI = async (client, text, targetLocale) => {
  const logger = Core.Logger('callDeepLTranslationAPI', { level: 'info' });
  
  // Convert locale format: de-DE -> DE, fr-FR -> FR, etc.
  const languageCode = convertLocaleToLanguageCode(targetLocale).toUpperCase();
  
  try {
    const response = await axios.post(`${client.baseURL}/translate`, {
      text: [text],
      target_lang: languageCode
    }, {
      headers: {
        'Authorization': `DeepL-Auth-Key ${client.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Adobe-GenStudio-Translation/1.0'
      },
      timeout: 30000
    });
    
    if (!response.data.translations || !response.data.translations[0]) {
      throw new Error('Invalid response structure from DeepL API');
    }
    
    const translatedText = response.data.translations[0].text;
    return translatedText;
  } catch (error) {
    logger.error(`❌ DeepL API call failed:`, error);
    throw error;
  }
};

/**
 * Calls OpenAI API for translation
 * @param {OpenAI} client - OpenAI client
 * @param {Object} params - Request parameters
 * @param {string} sourceLocale - Source locale
 * @param {string} targetLocale - Target locale
 * @param {Array} items - Items to translate
 * @returns {Object} OpenAI response
 */
const callOpenAITranslationAPI = async (client, params, sourceLocale, targetLocale, items) => {
  const model = params.OPENAI_MODEL || 'gpt-4o';
  const logger = Core.Logger('callOpenAITranslationAPI', { level: params.LOG_LEVEL || 'info' });
  
  logger.info(`🤖 OPENAI API CALL - Model: ${model}, Source: ${sourceLocale}, Target: ${targetLocale}`);
  logger.info(`📝 Items to translate: ${items.length} items`);
  
  const requestPayload = {
    model: model,
    temperature: 0.0,
    top_p: 1.0,
    frequency_penalty: 0.0,
    presence_penalty: 0.0,
    response_format: { type: 'json_schema', json_schema: OPENAI_TRANSLATION_RESPONSE_SCHEMA },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify({ sourceLocale, targetLocale, items }) },
    ],
  };
  
  try {
    logger.debug('🔧 OpenAI Request payload:', JSON.stringify(requestPayload, null, 2));
    const response = await client.chat.completions.create(requestPayload);
    logger.info('✅ OpenAI API call successful');
    logger.debug('📤 OpenAI Response:', JSON.stringify(response, null, 2));
    return response;
  } catch (error) {
    logger.error('❌ OpenAI API call failed:', error);
    logger.error('🔍 Error details - Status:', error.status, 'Message:', error.message);
    if (error.response) {
      logger.error('📋 Error response data:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
};

/**
 * Calls Azure OpenAI API for translation
 * @param {AzureOpenAI} client - Azure OpenAI client
 * @param {Object} params - Request parameters
 * @param {string} sourceLocale - Source locale
 * @param {string} targetLocale - Target locale
 * @param {Array} items - Items to translate
 * @returns {Object} Azure OpenAI response
 */
const callAzureOpenAITranslationAPI = async (client, params, sourceLocale, targetLocale, items) => {
  return await client.chat.completions.create({
    model: params.AZURE_OPENAI_DEPLOYMENT_NAME,
    temperature: 0.0,
    top_p: 1.0,
    frequency_penalty: 0.0,
    presence_penalty: 0.0,
    response_format: { type: 'json_schema', json_schema: OPENAI_TRANSLATION_RESPONSE_SCHEMA },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify({ sourceLocale, targetLocale, items }) },
    ],
  });
};

/**
 * Processes the translation response for a single target locale (OpenAI/Azure specific)
 * @param {Object} parsedResponse - Parsed API response
 * @param {string} targetLocale - Target locale
 * @param {Object} logger - Logger instance
 * @returns {Object} Results object or error response
 */
const processLLMTranslationResponse = (parsedResponse, targetLocale, logger) => {
  if (!parsedResponse.targetLocale || !parsedResponse.items) {
    logger.error('Invalid response format from LLM API:', parsedResponse);
    return { error: errorResponse(500, 'Invalid response format from translation service', logger) };
  }

  const translatedItems = parsedResponse.items;
  
  return {
    items: translatedItems.map(item => ({
      id: item.id,
      messages: item.messages.map(message => ({
        id: message.id,
        value: message.value
      }))
    }))
  };
};

/**
 * Generates translation response for given source locale, target locales, and items
 * @param {Object} params - Request parameters
 * @param {string} sourceLocale - The source locale code
 * @param {Array} targetLocales - Array of target locale codes
 * @param {Array} items - Array of items to translate
 * @returns {TranslationResponse} The translation response
 */
const getTranslation = async (params, sourceLocale, targetLocales, items) => {
  const logger = Core.Logger('getTranslation', { level: params.LOG_LEVEL || 'info' });
  const service = params.TRANSLATION_SERVICE || 'azure';
  
  logger.info(`🌍 TRANSLATION REQUEST - Service: ${service}, Source: ${sourceLocale}, Targets: [${targetLocales.join(', ')}]`);
  logger.info(`📊 Items to translate: ${items.length}`);
  
  try {
    const { type, client } = createTranslationClient(params);
    const results = {};
    
    logger.info(`✅ Using ${type} translation service - client created successfully`);
    
    // Translate for each target locale separately
    for (const targetLocale of targetLocales) {
      try {
        if (type === 'google') {
          // Google Translate implementation
          logger.info(`🌎 GOOGLE TRANSLATE - Starting translation for locale: ${targetLocale}`);
          logger.info(`📊 Processing ${items.length} items with Google Translate`);
          
          const translatedItems = [];
          
          for (const [itemIndex, item] of items.entries()) {
            logger.debug(`📝 Processing item ${itemIndex + 1}/${items.length}: ${item.id}`);
            const translatedMessages = [];
            
            for (const [msgIndex, message] of item.messages.entries()) {
              logger.debug(`   📝 Processing message ${msgIndex + 1}/${item.messages.length}: ${message.id}`);
              try {
                const translatedText = await callGoogleTranslateAPI(client, message.value, targetLocale);
                translatedMessages.push({
                  id: message.id,
                  value: translatedText
                });
                logger.debug(`   ✅ Translation complete: "${message.value}" -> "${translatedText}"`);
              } catch (error) {
                logger.error(`   ❌ Translation failed for message ${message.id}:`, error);
                throw error;
              }
            }
            
            translatedItems.push({
              id: item.id,
              messages: translatedMessages
            });
          }
          
          logger.info(`✅ Google Translate completed for locale: ${targetLocale} (${translatedItems.length} items)`);
          logger.debug(`🔍 GOOGLE TRANSLATE RESULT STRUCTURE for ${targetLocale}:`, JSON.stringify(translatedItems, null, 2));
          results[targetLocale] = translatedItems;
          
        } else if (type === 'deepl') {
          // DeepL implementation with language validation
          logger.info(`🔷 DEEPL TRANSLATE - Starting translation for locale: ${targetLocale}`);
          
          logger.info(`📊 Processing ${items.length} items with DeepL for locale: ${targetLocale}`);
          
          const translatedItems = [];
          
          for (const [itemIndex, item] of items.entries()) {
            logger.debug(`📝 Processing item ${itemIndex + 1}/${items.length}: ${item.id}`);
            const translatedMessages = [];
            
            for (const [msgIndex, message] of item.messages.entries()) {
              logger.debug(`   📝 Processing message ${msgIndex + 1}/${item.messages.length}: ${message.id}`);
              try {
                const translatedText = await callDeepLTranslationAPI(client, message.value, targetLocale);
                translatedMessages.push({
                  id: message.id,
                  value: translatedText
                });
                logger.debug(`   ✅ Translation complete: "${message.value}" -> "${translatedText}"`);
              } catch (error) {
                logger.error(`   ❌ Translation failed for message ${message.id}:`, error);
                
                // Check if it's a language support error
                if (error.message.includes('not supported by DeepL')) {
                  logger.warn(`⚠️ Language support error - skipping locale ${targetLocale}`);
                  break; // Break out of message loop and continue with next locale
                }
                
                throw error; // Re-throw other errors
              }
            }
            
            // Only add item if we have translated messages
            if (translatedMessages.length > 0) {
              translatedItems.push({
                id: item.id,
                messages: translatedMessages
              });
            }
          }
          
          // Only add to results if we have translated items
          if (translatedItems.length > 0) {
            logger.info(`✅ DeepL completed for locale: ${targetLocale} (${translatedItems.length} items)`);
            logger.debug(`🔍 DEEPL RESULT STRUCTURE for ${targetLocale}:`, JSON.stringify(translatedItems, null, 2));
            results[targetLocale] = translatedItems;
          } else {
            logger.warn(`⚠️ No translations completed for ${targetLocale} - locale skipped`);
          }
          
        } else {
          // OpenAI/Azure OpenAI implementation
          logger.info(`🚀 Starting ${type} translation for locale: ${targetLocale}`);
          let response;
          try {
            if (type === 'openai') {
              response = await callOpenAITranslationAPI(client, params, sourceLocale, targetLocale, items);
            } else {
              response = await callAzureOpenAITranslationAPI(client, params, sourceLocale, targetLocale, items);
            }
            logger.info(`📥 Received response from ${type} API for locale: ${targetLocale}`);
          } catch (apiError) {
            logger.error(`💥 ${type} API call failed for locale ${targetLocale}:`, apiError);
            return errorResponse(500, `${type} API call failed: ${apiError.message}`, logger);
          }
          
          const rawResponse = response.choices[0]?.message?.content;
          if (!rawResponse) {
            logger.error(`❌ Empty response from ${type} API for locale ${targetLocale}`);
            logger.error('🔍 Full response object:', JSON.stringify(response, null, 2));
            return errorResponse(500, 'Empty response from translation service', logger);
          }
          
          logger.info(`📝 Raw response length: ${rawResponse.length} characters for locale: ${targetLocale}`);
          logger.debug(`📋 Raw response content: ${rawResponse}`);
          
          let parsedResponse;
          try {
            parsedResponse = JSON.parse(rawResponse);
            logger.info(`✅ Successfully parsed JSON response for locale: ${targetLocale}`);
          } catch (parseError) {
            logger.error(`💥 Failed to parse response for locale ${targetLocale}:`, parseError);
            logger.error('🔍 Raw response that failed to parse:', rawResponse);
            return errorResponse(500, 'Invalid JSON response from translation service', logger);
          }
          
          const processResult = processLLMTranslationResponse(parsedResponse, targetLocale, logger);
          if (processResult.error) {
            logger.error(`💥 Failed to process LLM response for locale ${targetLocale}`);
            return processResult.error;
          }
          
          logger.info(`✅ Successfully processed translation for locale: ${targetLocale}`);
          results[targetLocale] = processResult.items;
        }
        
        logger.debug(`Translation completed for ${targetLocale} using ${type}`);
        
      } catch (error) {
        logger.error(`Failed to translate for locale ${targetLocale}:`, error);
        return errorResponse(500, `Translation failed for locale ${targetLocale}: ${error.message}`, logger);
      }
    }
    
    const completedLocales = Object.keys(results);
    const requestedLocales = targetLocales;
    const skippedLocales = requestedLocales.filter(locale => !completedLocales.includes(locale));
    
    logger.info(`✅ TRANSLATION COMPLETED - Service: ${service.toUpperCase()}, Completed: ${completedLocales.join(', ')}, Items: ${Object.values(results)[0]?.length || 0}`);
    if (skippedLocales.length > 0) {
      logger.warn(`⚠️ SKIPPED LOCALES: ${skippedLocales.join(', ')} (Not supported by ${service})`);
    }
    
    return {
      status: 200,
      results
    };
  } catch (error) {
    logger.error('Failed to process translation request:', error);
    return errorResponse(500, 'Failed to process translation request', logger);
  }
};

/**
 * Main function handler
 * @param {Object} params - Request parameters
 * @returns {Object} Response object
 */
async function main(params) {
  const logger = Core.Logger('main', { level: params.LOG_LEVEL || 'info' });
  
  logger.info('Calling the get translation action');
  logger.debug(stringParameters(params));

  try {
    // Validate environment variables first
    const envError = validateEnvironment(params, logger);
    if (envError) {
      return {
        statusCode: envError.error.statusCode,
        body: envError.error.body
      };
    }

    const paramResult = extractParameters(params, logger);
    if (paramResult.error) {
      return {
        statusCode: paramResult.error.status,
        body: paramResult.error
      };
    }
    
    const { sourceLocale, targetLocales, items } = paramResult;

    const validationError = validateParameters(sourceLocale, targetLocales, items, logger);
    if (validationError) {
      return {
        statusCode: validationError.status,
        body: validationError
      };
    }

    const translationResponse = await getTranslation(params, sourceLocale, targetLocales, items);
    
    const response = {
      statusCode: translationResponse.status === 200 ? 200 : translationResponse.status,
      body: translationResponse
    };

    logger.info(`${response.statusCode}: successful request`);
    return response;
  } catch (error) {
    logger.error('Unexpected error:', error);
    return errorResponse(500, 'Internal server error', logger);
  }
}

exports.main = main;
