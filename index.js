const express = require('express');
const fs = require('fs');
const https = require('https');
const path = require('path');
const app = express();

const port = process.env.PORT || 3000;
const softdeletion = process.env.softdeletion || true;
const maxPasteIDLength = process.env.maxpasteidlength || 10;
const agent = new https.Agent({ rejectUnauthorized: false }); // Disable SSL verification


// Define the directory for paste storage
const PASTES_DIR = path.join(__dirname, 'pastes');

// Sanitize and construct file paths
const sanitizeId = (id) => {
    let sanitized = id.replace(/[^a-zA-Z0-9_-]/g, '');
    sanitized = sanitized.replace("-deleted",'');
    if (sanitized !== id) {
        return "ERR-INVALID-ID"

    }
    if (sanitized.length >= maxPasteIDLength) {
        return "ERR-TOO-LONG-ID"
    }
    return sanitized;
};

const getFilePath = (id) => {
    let sanitized = sanitizeId(id);
    if(sanitized === "ERR-INVALID-ID" || sanitized === "ERR-TOO-LONG-ID") {
        return sanitized;
    } else {
        return path.join(PASTES_DIR, sanitizeId(id));
    }
}

// Helper function to read a file
const readFile = (filePath, res, notFoundMessage = 'Not found in cache') => {
    fs.readFile(filePath, (err, data) => {
        if (!err && data) {
            res.status(200).send(data);
        } else {
            res.status(404).send(notFoundMessage);
        }
    });
};

// Async helper function to ensure pastes directory exists
const ensureDirectoryExists = async () => {
    try {
        if (!(await fs.promises.stat(PASTES_DIR).catch(() => false))) {
            await fs.promises.mkdir(PASTES_DIR, { recursive: true });
        }
    } catch (error) {
        console.error('Failed to create directory:', error.message);
    }
};

// Async helper function to write a file
const saveFile = async (filePath, content) => {
    try {
        await fs.promises.writeFile(filePath, content);
    } catch (error) {
        throw new Error('Failed to write file: ' + error.message);
    }
};


// Helper function to fetch data from external API
const fetchPasteContent = (pasteId, headers, onSuccess, onError) => {
    let options = {
        method: 'GET',
        host: 'p.sc3.io',
        path: `/api/v1/pastes/${pasteId}/raw`,
        headers: headers
    }
    https.get(`https://p.sc3.io/api/v1/pastes/${pasteId}/raw`, (res) => {
            let data = [];
            res.on('data', (chunk) => data.push(chunk));
            res.on('end', () => {
                if (res.statusCode === 200) {
                    console.log("Successfully got paste content for " + pasteId);
                    onSuccess(Buffer.concat(data).toString(), res.headers);
                } else if (res.statusCode === 404) {
                    let filePath = getFilePath(pasteId);
                    if(fs.existsSync(filePath) && softdeletion) {
                        fs.rename(filePath, filePath + "-deleted", () => {
                            console.log("Soft-deleted paste for " + pasteId);
                            onError(`Paste not found (status: ${res.statusCode})`);
                        });
                    } else {
                        onError(`Paste not found (status: ${res.statusCode})`);
                    }

                } else {
                    onError(`Paste not found (status: ${res.statusCode})`);
                }
            });
        })
        .on('error', (err) => {
            onError(err.message);
        });
};

// Route to get cached paste content
app.get('/api/v1/pastes/:id/cache', async (req, res) => {
    try {
        const filePath = getFilePath(req.params.id);
        readFile(filePath, res);
    } catch (err) {
        console.error('Error in GET /api/v1/pastes/:id/cache:', err.message);
        res.status(500).send('Paste not found.');
    }
});

// Route to fetch live or cached paste content
app.get('/api/v1/pastes/:id/raw', async (req, res) => {
    const pasteId = req.params.id;

    try {
        await ensureDirectoryExists();
        fetchPasteContent(
            pasteId, req.headers,
            async (content, headers) => {
                try {
                    await saveFile(getFilePath(pasteId), content);
                    res.headers = headers;
                    res.status(200).send(content);
                } catch (err) {
                    console.error('Error saving file:', err.message);
                    res.status(500).send('Failed to cache paste content.');
                }
            },
            (errorMessage) => {
                console.error(errorMessage);
                const filePath = getFilePath(pasteId);
                // Fallback to cached copy
                readFile(filePath, res, 'Paste not found.');
            }
        );
    } catch (err) {
        console.error('Error in GET /api/v1/pastes/:id/raw:', err.message);
        res.status(500).send('An error occurred while processing your request.');
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});