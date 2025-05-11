const express = require('express')
const fs = require('fs');
const https = require('https');


const app = express()
const port = 3000

app.get('/paste/:id', (req, res) => {
    fs.readFile("./pastes/" + req.params.id, (err, data) => {
        if (!err && data) {
            res.statusCode = 200;
            res.send(data)
        } else {
            res.statusCode = 404;
            res.send('Not found in cache')

        }
    });
})

app.post('/paste/:id', (req, res) => {

    https.get('https://p.sc3.io/api/v1/pastes/' + req.params.id + "/raw", res => {
        let data = [];
        const headerDate = res.headers && res.headers.date ? res.headers.date : 'no response date';
        console.log('Status Code:', res.statusCode);
        console.log('Date in Response header:', headerDate);

        res.on('data', chunk => {
            data.push(chunk);
        });

        res.on('end', () => {
            console.log('Response ended: ');
            const content = Buffer.concat(data).toString();
            if (!fs.existsSync('./pastes')) {
                fs.mkdir(
                    './pastes',
                    err => {
                        if (err) {
                            console.error(err);
                        }
                    })
            }
            fs.writeFileSync('./pastes/' + req.params.id, content);
            res.statusCode = 200;
            res.send('ok');
        });
    }).on('error', err => {
        console.log('Error: ', err.message);
    });

})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})