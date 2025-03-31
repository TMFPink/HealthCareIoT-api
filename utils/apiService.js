const axios = require('axios');
require('dotenv').config(); 
// Configure your API endpoint here
const API_URL = `${process.env.API_URL}/reading-data`;

/**
 * Send data to external API
 * @param {Object|Number|String} data - The data to send (parsed JSON or raw value)
 * @returns {Promise} - The API response
 */
async function sendToApi(data) {
  try {
    // Format the data properly for the API
    const formattedData = typeof data === 'object' ? data : { number: data };
    
    console.log(`Sending to API: ${JSON.stringify(formattedData)}`);
    const response = await axios.post(API_URL, formattedData);
    console.log('API response:', response.status);
    return response.data;
  } catch (error) {
    console.error('Error sending data to API:', error.message);
    throw error;
  }
}

module.exports = {
  sendToApi
};
