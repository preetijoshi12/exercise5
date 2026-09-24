/* GLOBAL CONSTANTS AND VARIABLES */

/* assignment specific globals */
const WIN_Z = 0;  // default graphics window z coord in world space
const WIN_LEFT = 0; const WIN_RIGHT = 1;  // default left and right x coords in world space
const WIN_BOTTOM = 0; const WIN_TOP = 1;  // default top and bottom y coords in world space
const INPUT_TRIANGLES_URL = "triangles.json"; // LOCAL triangles file loc
const INPUT_ELLIPSOIDS_URL = "ellipsoids.json"; // LOCAL ellipsoids file loc
var Eye = new vec4.fromValues(0.5,0.5,-0.5,1.0); // default eye position in world space

/* webgl globals */
var gl = null; // the all powerful gl object. It's all here folks!
var vertexBuffer; // this contains vertex coordinates in triples
var colorBuffer; // this contains vertex diffuse colors in triples
var triangleBuffer; // this contains indices into vertexBuffer in triples
var triBufferSize = 0; // the number of indices in the triangle buffer
var vertexPositionAttrib; // where to put position for vertex shader
var vertexColorAttrib; // where to put diffuse color for vertex shader


// ASSIGNMENT HELPER FUNCTIONS

// get the JSON file from the passed URL
function getJSONFile(url,descr) {
    var returnValue = String.null;

    if ((typeof(url) !== "string") || (typeof(descr) !== "string"))
        console.error("getJSONFile: parameter not a string");
    else {
        var loadDone = false;
        
        function getFailed(evt) {
            loadDone = true; 
            console.error(descr + " failed to load.");
        }

        function getAborted(evt) { 
            loadDone = true; 
            console.error(descr + " was aborted by user.");
        }

        function getTimedOut(evt) {
            loadDone = true; 
            console.error(descr + " took too long to load.");
        }

        function getLoaded(evt) {
            loadDone = true; 
            console.log(descr + " loaded.");
            returnValue = JSON.parse(httpReq.responseText);
        }

        var httpReq = new XMLHttpRequest();
        httpReq.addEventListener("error", getFailed);
        httpReq.addEventListener("abort", getAborted);
        httpReq.addEventListener("timeout", getTimedOut);
        httpReq.addEventListener("load", getLoaded);

        httpReq.open("GET",url,false); // init the request asynchronously
        httpReq.send(null); // send the request
        
        var numChecks = 0;
        while (!loadDone && (numChecks < 25)) {
            window.setTimeout(function(){},100);
            numChecks++;
        }
    }
    
    return(returnValue);
}

// set up the webGL environment
function setupWebGL() {
    var canvas = document.getElementById("myWebGLCanvas");
    gl = canvas.getContext("webgl");
    
    try {
      if (gl == null) {
        throw "unable to create gl context -- is your browser gl ready?";
      } else {
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clearDepth(1.0);
        gl.enable(gl.DEPTH_TEST);
      }
    }
    catch(e) {
      console.log(e);
    }
}

// read triangles in, load them into webgl buffers
function loadTriangles() {
    var inputTriangles = getJSONFile(INPUT_TRIANGLES_URL,"triangles");

    if (inputTriangles != String.null) { 
        var whichSetVert;
        var whichSetTri;
        var coordArray = [];
        var colorArray = [];
        var indexArray = [];
        var vtxBufferSize = 0;
        var vtxToAdd = [];
        var indexOffset = vec3.create();
        var triToAdd = vec3.create();
        
        for (var whichSet=0; whichSet<inputTriangles.length; whichSet++) {
            vec3.set(indexOffset,vtxBufferSize,vtxBufferSize,vtxBufferSize);
            
            // fetch diffuse color
            var diffuse = inputTriangles[whichSet].material.diffuse;
            
            for (whichSetVert=0; whichSetVert<inputTriangles[whichSet].vertices.length; whichSetVert++) {
                vtxToAdd = inputTriangles[whichSet].vertices[whichSetVert];
                coordArray.push(vtxToAdd[0],vtxToAdd[1],vtxToAdd[2]);
                
                // push color per vertex
                colorArray.push(diffuse[0], diffuse[1], diffuse[2]);
            }
            
            for (whichSetTri=0; whichSetTri<inputTriangles[whichSet].triangles.length; whichSetTri++) {
                vec3.add(triToAdd,indexOffset,inputTriangles[whichSet].triangles[whichSetTri]);
                indexArray.push(triToAdd[0],triToAdd[1],triToAdd[2]);
            }

            vtxBufferSize += inputTriangles[whichSet].vertices.length;
            triBufferSize += inputTriangles[whichSet].triangles.length;
        } 
        triBufferSize *= 3;

        // positions
        vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(coordArray),gl.STATIC_DRAW);

        // colors
        colorBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER,colorBuffer);
        gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(colorArray),gl.STATIC_DRAW);
        
        // indices
        triangleBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triangleBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indexArray),gl.STATIC_DRAW);
    }
}

// setup the webGL shaders
function setupShaders() {
    var fShaderCode = `
        precision mediump float;
        varying vec3 vColor;

        void main(void) {
            gl_FragColor = vec4(vColor, 1.0);
        }
    `;
    
    var vShaderCode = `
        attribute vec3 vertexPosition;
        attribute vec3 vertexColor;
        varying vec3 vColor;

        void main(void) {
            vColor = vertexColor;
            
            // Map [0,1] coordinates to [-1, 1] WebGL viewport coordinates
            vec3 ndcPosition = (vertexPosition * 2.0) - vec3(1.0, 1.0, 0.0);
            gl_Position = vec4(ndcPosition, 1.0);
        }
    `;
    
    try {
        var fShader = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fShader,fShaderCode);
        gl.compileShader(fShader);

        var vShader = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vShader,vShaderCode);
        gl.compileShader(vShader);
            
        if (!gl.getShaderParameter(fShader, gl.COMPILE_STATUS)) {
            throw "error during fragment shader compile: " + gl.getShaderInfoLog(fShader);  
        } else if (!gl.getShaderParameter(vShader, gl.COMPILE_STATUS)) {
            throw "error during vertex shader compile: " + gl.getShaderInfoLog(vShader);  
        } else {
            var shaderProgram = gl.createProgram();
            gl.attachShader(shaderProgram, fShader);
            gl.attachShader(shaderProgram, vShader);
            gl.linkProgram(shaderProgram);

            if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
                throw "error during shader program linking: " + gl.getProgramInfoLog(shaderProgram);
            } else {
                gl.useProgram(shaderProgram);
                
                vertexPositionAttrib = gl.getAttribLocation(shaderProgram, "vertexPosition");
                gl.enableVertexAttribArray(vertexPositionAttrib);

                vertexColorAttrib = gl.getAttribLocation(shaderProgram, "vertexColor");
                gl.enableVertexAttribArray(vertexColorAttrib);
            }
        }
    } 
    catch(e) {
        console.log(e);
    }
}

// render the loaded model
function renderTriangles() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
    gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffer);
    gl.vertexAttribPointer(vertexPositionAttrib,3,gl.FLOAT,false,0,0);

    gl.bindBuffer(gl.ARRAY_BUFFER,colorBuffer);
    gl.vertexAttribPointer(vertexColorAttrib,3,gl.FLOAT,false,0,0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,triangleBuffer);
    gl.drawElements(gl.TRIANGLES,triBufferSize,gl.UNSIGNED_SHORT,0);
}

function main() {
  setupWebGL();
  loadTriangles();
  setupShaders();
  renderTriangles();
}
