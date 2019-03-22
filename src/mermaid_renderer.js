'use strict';
const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer');
const tmp = require('tmp');

const error = message => {
    console.log(`\n${message}\n`);
    process.exit(1);
};

const checkConfigFile = file => {
    if (!fs.existsSync(file)) {
        error(`Configuration file "${file}" doesn't exist`);
    }
};

const _asyncToGenerator = (fn) => {
    return function () {
        var gen = fn.apply(this, arguments);
        return new Promise(function (resolve, reject) {
            function step(key, arg) {
                try {
                    var info = gen[key](arg);
                    var value = info.value;
                } catch (error) {
                    reject(error);
                    return;
                }
                if (info.done) {
                    resolve(value);
                } else {
                    return Promise.resolve(value).then(function (value) {
                        step("next", value);
                    }, function (err) {
                        step("throw", err);
                    });
                }
            }
            return step("next");
        });
    };
}

const renderMermaidChunk = (i = null, o = null, t = 'default', w = 800, h = 600, bgcolor = null, cfg, css, pupCfg) => {
    let theme = t;
    let width = w;
    let height = h;
    let input = i;
    let output = o;
    let backgroundColor = bgcolor;
    let configFile = cfg;
    let cssFile = css;
    let puppeteerConfigFile = pupCfg;

    // check input file
    if (!input) {
        error('Please specify input file: -i <input>');
    }

    if (!fs.existsSync(input)) {
        error(`Input file "${input}" doesn't exist`);
    }

    if (!output) {
        output = input + '.svg';
    }

    // check output file

    if (!/\.(?:svg|png|pdf)$/.test(output)) {
        error(`Output file must end with ".svg", ".png" or ".pdf"`);
    }
    const outputDir = path.dirname(output);
    if (!fs.existsSync(outputDir)) {
        error(`Output directory "${outputDir}/" doesn't exist`);
    }

    // check config files
    let mermaidConfig = {
        theme
    };

    if (configFile) {
        checkConfigFile(configFile);
        mermaidConfig = Object.assign(mermaidConfig, JSON.parse(fs.readFileSync(configFile, 'utf-8')));
    }
    let puppeteerConfig = {};
    if (puppeteerConfigFile) {
        checkConfigFile(puppeteerConfigFile);
        puppeteerConfig = JSON.parse(fs.readFileSync(puppeteerConfigFile, 'utf-8'));
    }

    // check cssFile
    let myCSS;
    if (cssFile) {
        if (!fs.existsSync(cssFile)) {
            error(`CSS file "${cssFile}" doesn't exist`);
        }
        myCSS = fs.readFileSync(cssFile, 'utf-8');
    }

    // normalize args
    width = parseInt(width);
    height = parseInt(height);
    backgroundColor = backgroundColor || 'white';

    return _asyncToGenerator(function* () {
        const browser = yield puppeteer.launch(puppeteerConfig);
        const page = yield browser.newPage();

        page.setViewport({
            width,
            height
        });
        yield page.goto(`file://${path.join(__dirname, 'index.html')}`);
        yield page.evaluate(`document.body.style.background = '${backgroundColor}'`);
        const definition = fs.readFileSync(input, 'utf-8');

        yield page.$eval('#container', function (container, definition, mermaidConfig, myCSS) {
            container.innerHTML = definition;
            window.mermaid.initialize(mermaidConfig);
    
            if (myCSS) {
                const head = window.document.head || window.document.getElementsByTagName('head')[0];
                const style = document.createElement('style');
                style.type = 'text/css';
                if (style.styleSheet) {
                    style.styleSheet.cssText = myCSS;
                } else {
                    style.appendChild(document.createTextNode(myCSS));
                }
                head.appendChild(style);
            }
    
            window.mermaid.init(undefined, container);
        }, definition, mermaidConfig, myCSS);
        
        if (output.endsWith('svg')) {
            const svg = yield page.$eval('#container', function (container) {
                return container.innerHTML;
            });
            fs.writeFileSync(output, svg);
        } else if (output.endsWith('png')) {
            const clip = yield page.$eval('svg', function (svg) {
                const react = svg.getBoundingClientRect();
                return {
                    x: react.left,
                    y: react.top,
                    width: react.width,
                    height: react.height
                };
            });
            yield page.screenshot({
                path: output,
                clip,
                omitBackground: backgroundColor === 'transparent'
            });
        } else {
            // pdf
            yield page.pdf({
                path: output,
                printBackground: backgroundColor !== 'transparent'
            });
        }

        fs.unlinkSync(input);
    
        browser.close();
    })();
};

const getOutputSpecifiedFileName = (filename, folderPath) => {
    return `${folderPath}/${filename}`;
}

const getOutputFileName = (num, folderPath) => {
    const n = num || 0;

    const activeEditor = vscode.window.activeTextEditor;
     
    const editorPath = activeEditor ? activeEditor.document.uri.fsPath : undefined
    const filename = path.parse(editorPath).name;

    return `${folderPath}/${filename}_mrmd_${n}.png`;
}

const getInputFileName = (num, folderPath) => {
    const n = num || 0;
    
    const activeEditor = vscode.window.activeTextEditor;
     
    const editorPath = activeEditor ? activeEditor.document.uri.fsPath : undefined
    const filename = path.parse(editorPath).name;
    
    return `${folderPath}/${filename}_input_${n}.md`;
}

const renderMermaid = () => {
    //TODO проверки

    const activeEditor = vscode.window.activeTextEditor;
    const editorPath = activeEditor ? activeEditor.document.uri.fsPath : undefined;
    const linesCount = parseInt(activeEditor.document.lineCount, 10);

    const startReg = /^```mermaid(?:\s+(.+\.(?:svg|png|pdf)))?\s*$/i;
    const endReg = /^```\s*$/;

    let write = false;
    let tmp_str = '';

    let inputFile = null;
    let outputFile = null;

    const currentFolder = path.dirname(editorPath);
    const tmpObj = tmp.dirSync()
    const tempFolder = tmpObj.name;

    let graphsCount = 0;

    const promises = [];

    for (var i = 0; i < linesCount; i++) {
        const line = activeEditor.document.lineAt(i);

        const resEnd = line.text.match(endReg);

        if (resEnd && write) {
            write = false;

            inputFile = getInputFileName(graphsCount, tempFolder);
            fs.writeFileSync(inputFile, tmp_str);

            const p = renderMermaidChunk(inputFile, outputFile)
                .then(() => {
                    vscode.window.showInformationMessage(`${outputFile} was successfuly generated`);
                })
                .catch((e) => {
                    vscode.window.showErrorMessage(e.message);
                    fs.unlink(inputFile);
                });

            promises.push(p);
        }

        if (write) tmp_str += `${line.text}${os.EOL}`;

        const resStart = line.text.match(startReg)

        if (resStart) {
            graphsCount++;
            write = true;
            tmp_str = '';

            if (resStart[1] && typeof resStart[1] === 'string') {
                outputFile = getOutputSpecifiedFileName(resStart[1], currentFolder);
            } else {
                outputFile = getOutputFileName(graphsCount, currentFolder);
            }
        }
    }

    if (promises && promises.length > 0) {
        Promise.all(promises).then(() => {
            tmpObj.removeCallback();
        });
    }
}

module.exports = renderMermaid;