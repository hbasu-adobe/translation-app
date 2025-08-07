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
const { stringParameters } = require('./utils')

/** @type {import('@adobe/genstudio-extensibility-sdk').Locale[]} */
const SUPPORTED_LOCALES = [
  { code: 'fr-FR', label: 'French' },
  { code: 'de-DE', label: 'German' },
  { code: 'it-IT', label: 'Italian' },
  { code: 'es-ES', label: 'Spanish (Spain)' },
  { code: 'nl-NL', label: 'Dutch' },
]



// Log the locale definitions at module load time
console.log('🏗️ MODULE LOAD: getSupportedLocales.js - SUPPORTED_LOCALES array initialized with', SUPPORTED_LOCALES.length, 'locales')

async function main (params) {
  const logger = Core.Logger('main', { level: params.LOG_LEVEL || 'info' })
  logger.info('Calling the get supported locales action')
  logger.debug(stringParameters(params))

  try { 
    // Check which translation service is being used
    const translationService = params.TRANSLATION_SERVICE || 'azure';
    let localesToReturn;
    
    // Use standard supported locales for all services
    localesToReturn = SUPPORTED_LOCALES;
    logger.info('📍 SUPPORTED LOCALES SOURCE: Using standard SUPPORTED_LOCALES array from getSupportedLocales.js')
    
    logger.info('📝 LOCALES content:', JSON.stringify(localesToReturn, null, 2))
    logger.info(`📊 Total locales count: ${localesToReturn.length}`)
    
    const response = {
      statusCode: 200,
      body: {
        locales: localesToReturn
      }
    }
    logger.info(`${response.statusCode}: successful request - returning ${localesToReturn.length} supported locales`)
    return response
  } catch (error) {
    logger.error(error)
    return {
      error: {
        statusCode: 500,
        body: { error: 'server error' }
      }
    }
  }
}

exports.main = main
