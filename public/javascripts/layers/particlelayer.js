/**
* Copyright © 2015 Uncharted Software Inc.
*
* Property of Uncharted™, formerly Oculus Info Inc.
* http://uncharted.software/
*
* Released under the MIT License.
*
* Permission is hereby granted, free of charge, to any person obtaining a copy of
* this software and associated documentation files (the "Software"), to deal in
* the Software without restriction, including without limitation the rights to
* use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
* of the Software, and to permit persons to whom the Software is furnished to do
* so, subject to the following conditions:
*
* The above copyright notice and this permission notice shall be included in all
* copies or substantial portions of the Software.
*
* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
* IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
* FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
* AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
* LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
* OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
* SOFTWARE.
*/

var Config = require('../config.js');
var WebGLOverlay = require('./webgloverlay');
var LoadingBar = require('../ui/loadingbar');

var IS_MOBILE = require('../util/mobile').IS_MOBILE;
var PARTICLE_COUNT = IS_MOBILE ? Config.particle_count * Config.particle_mobile_factor : Config.particle_count;
var PARTICLE_COUNT_MIN = IS_MOBILE ? Config.particle_count_min * Config.particle_mobile_factor : Config.particle_count_min;
var PARTICLE_COUNT_MAX = IS_MOBILE ? Config.particle_count_max * Config.particle_mobile_factor : Config.particle_count_max;

var ParticleLayer = WebGLOverlay.extend({

    initShaders: function( done ) {
        this._shader = new esper.Shader({
            vert: '../../shaders/particle.vert',
            frag: '../../shaders/particle.frag'
        }, function() {
            // execute callback
            done();
        });
    },

    initBuffers: function( done ) {
        // create filler array
        var filler = _.fill( new Array( Config.particle_count_max ), [ 0,0,0,0 ] );
        // create vertex buffer, this will be updated periodically
        this._vertexBuffer = new esper.VertexBuffer(
            new esper.VertexPackage([
                /**
                 * x: startX
                 * y: startY
                 * y: endX
                 * w: endY
                 */
                filler,
                /**
                 * x: offset
                 * y: speed
                 * y: rand0
                 * w: rand1
                 */
                filler ])
        );
        // execute callback
        done();
    },

    updateNodes: function(nodes) {
        var self = this;
        if (nodes) {
            this._nodes = nodes;
        }
        // prepare loading bar
        if ( this._loadingBar ) {
            this._loadingBar.cancel();
        }
        this._loadingBar = new LoadingBar();
        // flag as not ready to draw
        this._isReady = false;
        // terminate existing worker
        if ( this._worker ) {
            this._worker.terminate();
        }
        // create web worker to generate particles
        this._worker = new Worker('javascripts/particles/particlesystem.js');
        this._worker.addEventListener('message', function( e ) {
            switch ( e.data.type ) {
                case 'progress':
                    self._loadingBar.update( e.data.progress );
                    break;
                case 'complete':
                    this._loadingBar = null;
                    self._vertexBuffer.bufferData( new Float32Array( e.data.buffer ) );
                    self._timestamp = Date.now();
                    self._isReady = true; // flag as ready to draw
                    self._worker.terminate();
                    self._worker = null;
                    break;
            }
        });
        // start the webworker
        this._worker.postMessage({
            type: 'start',
            spec: {
                speed: Config.particle_base_speed_ms,
                variance: Config.particle_speed_variance_ms,
                offset: Config.particle_offset * this.getPathOffset(),
                count: this.getParticleCount()
            },
            nodes: this._nodes
        });
    },

    _drawHiddenServices: function() {
        var gl = this._gl,
            hiddenServicesCount = Math.floor(Config.hiddenServiceProbability * this.getParticleCount());
        this._shader.setUniform( 'uColor', [ 0.6, 0.1, 0.3 ] );
        gl.drawArrays( gl.POINTS, 0, hiddenServicesCount );
    },

    _drawGeneralServices: function() {
        var gl = this._gl,
            hiddenServicesCount = Math.floor(Config.hiddenServiceProbability * this.getParticleCount());
        this._shader.setUniform( 'uColor', [ 0.1, 0.3, 0.6 ] );
        gl.drawArrays( gl.POINTS, hiddenServicesCount, this.getParticleCount() - hiddenServicesCount );
    },

    showTraffic: function(state) {
        if (state !== undefined) {
            this._showTraffic = state;
            return this;
        } else {
            return this._showTraffic;
        }
    },

    setSpeed: function( speed ) {
        this._speed = speed;
    },

    getSpeed: function() {
        return this._speed !== undefined ? this._speed : 1.0;
    },

    setPathOffset: function( offset ) {
        this._pathOffset = offset;
    },

    getPathOffset: function() {
        return this._pathOffset !== undefined ? this._pathOffset : 1.0;
    },

    setParticleSize: function(size) {
        this._particleSize = size;
        if ( Config.particle_zoom_scale ) {
            return Config.particle_zoom_scale( this._map.getZoom(), Config.particle_size );
        }
        return Config.particle_size;
    },

    getParticleSize: function() {
        if ( this.scaleByZoom() ) {
            return Config.particle_zoom_scale( this._map.getZoom(), this._particleSize || Config.particle_size );
        }
        return this._particleSize || Config.particle_size;
    },

    setParticleCount: function(count) {
        this._particleCount = count;
        this.updateNodes();
    },

    getParticleCount: function() {
        return this._particleCount || PARTICLE_COUNT;
    },

    getParticleCountMin: function() {
        return PARTICLE_COUNT_MIN;
    },

    getParticleCountMax: function() {
        return PARTICLE_COUNT_MAX;
    },

    _clearBackBuffer: function() {
        var gl = this._gl;
        gl.clear( gl.COLOR_BUFFER_BIT );
    },

    clear: function() {
        this._clearBackBuffer();
        this._isReady = false;
    },

    setOpacity: function( opacity ) {
        this._opacity = opacity;
    },

    getOpacity: function() {
        return this._opacity !== undefined ? this._opacity : 1.0;
    },

    scaleByZoom: function(scaleByZoom) {
        if ( scaleByZoom !== undefined ) {
            this._scaleByZoom = scaleByZoom;
            return this;
        }
        return this._scaleByZoom !== undefined ? this._scaleByZoom : Config.particle_zoom_scale;
    },

    draw: function() {
        this._clearBackBuffer();
        if ( this._isReady ) {
            this._viewport.push();
            this._shader.push();
            this._shader.setUniform( 'uProjectionMatrix', this._camera.projectionMatrix() );
            this._shader.setUniform( 'uTime', Date.now() - this._timestamp );
            this._shader.setUniform( 'uSpeedFactor', this.getSpeed() );
            this._shader.setUniform( 'uOffsetFactor', this.getPathOffset() );
            this._shader.setUniform( 'uPointSize', this.getParticleSize() );
            this._shader.setUniform( 'uOpacity', this.getOpacity() );
            this._vertexBuffer.bind();
            if (this._showTraffic === 'hidden') {
                // draw hidden traffic
                this._drawHiddenServices();
            } else if (this._showTraffic === 'general') {
                // draw non-hidden traffic
                this._drawGeneralServices();
            } else {
                // draw all traffic
                this._drawGeneralServices();
                this._drawHiddenServices();
            }
            this._vertexBuffer.unbind();
            this._shader.pop();
            this._viewport.pop();
        }
    }

});

module.exports = ParticleLayer;