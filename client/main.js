
times = null;
streamsource = null;
audioContext = null;
analyser = null;
var ts = new TimeSeries();
times = ts;
var ts2 = new TimeSeries();
times2 = ts2;
varray = new Array();
aarray = new Array();
abuffer = new Array();
vsum = 0;
asum = 0;
psum = 0;
buflen = 2048;
buf = new Uint8Array( buflen );
framerate = 0;
foo = null;
tstamp = function () {
    return new Date().getTime();
}

scorebuffer = new Array();
totalscore = 0;

curtime = function () {
    return (tstamp() - starttime)/1000;
}

starttime = tstamp();

dancer = new Dancer();
kick = dancer.createKick({
    onKick: function () {
	console.log("ONKICK");
    },
    offKick: function () {
	console.log("OFFKICK");
    }
});

dancer.onceAt( 0, function () {
    kick.on();
});

//bd = new BeatDetektor(48,280);
//bd2 = new BeatDetektor(48,280);

var cht = new SmoothieChart();
Meteor.defer( function () {
    cht.addTimeSeries(ts, { strokeStyle: 'rgba(0, 255, 0, 1)', fillStyle: 'rgba(0, 255, 0, 0.2)', lineWidth: 4 });
    cht.addTimeSeries(ts2, { strokeStyle: 'rgba(255, 0, 0, 1)', fillStyle: 'rgba(255, 0, 0, 0.2)', lineWidth: 4 });
    cht.streamTo(document.getElementById("chart"), 20);
});

window.addEventListener('load', init, false);

function init() {
    try {
	// Fix up for prefixing
	window.AudioContext = window.AudioContext||window.webkitAudioContext;
	audioContext = new AudioContext();
    }
    catch(e) {
	alert('Web Audio API is not supported in this browser');
    }
}

function convertToMono( input ) {
    var splitter = audioContext.createChannelSplitter(2);
    var merger = audioContext.createChannelMerger(2);

    input.connect( splitter );
    splitter.connect( merger, 0, 0 );
    splitter.connect( merger, 0, 1 );
    return merger;
}

(function (doc, nav) {
    "use strict";

    var f = 0;
    Meteor.setInterval(function () {framerate = f; document.getElementById("f").innerHTML = f + " fps"; f = 0;}, 1000);

    var div, audio, video, width, height, context;
    var bufidx = 0, buffers = [];

    function initialize() {
	// The source video.
	audio = doc.getElementById("a");
	video = doc.getElementById("v");
	width = video.width;
	height = video.height;
	div = document.getElementById("d");

	// The target canvas.
	var canvas = doc.getElementById("c");
	context = canvas.getContext("2d");

	// Prepare buffers to store lightness data.
	for (var i = 0; i < 2; i++) {
	    buffers.push(new Uint8Array(width * height));
	}

	// Get the webcam's stream.
	nav.getUserMedia({video: true, audio: true}, startStream, function () {});
    }

    function startStream(stream) {
	video.src = URL.createObjectURL(stream);
	video.play();
	video.muted = true;

	streamsource = audioContext.createMediaStreamSource(stream);
	analyser = audioContext.createAnalyser();
	analyser.fftSize = 2048;
	convertToMono( streamsource ).connect( analyser );
	
	audio.src = URL.createObjectURL(stream);
//	audio.play();
	audio.muted = true;

	dancer.load({audio: URL.createObjectURL(stream)});

	// Ready! Let's start drawing.
	requestAnimationFrame(draw);
    }

    function draw() {
	var frame = readFrame();

	if (frame) {
	    markLightnessChanges(frame.data);
	    context.putImageData(frame, 0, 0);
	}

	// Wait for the next frame.
	requestAnimationFrame(draw);
    }

    function readFrame() {
	try {
	    context.drawImage(video, 0, 0, width, height);
	} catch (e) {
	    // The video may not be ready, yet.
	    return null;
	}

	return context.getImageData(0, 0, width, height);
    }

    function markLightnessChanges(data) {
	// Pick the next buffer (round-robin).
	var buffer = buffers[bufidx++ % buffers.length];
	
	var nChanged = 0;
	
	for (var i = 0, j = 0; i < buffer.length; i++, j += 4) {
	    // Determine lightness value.
	    var current = lightnessValue(data[j], data[j + 1], data[j + 2]);
	    
	    // Set color to black.
	    data[j] = data[j + 1] = data[j + 2] = 0;
	    
	    var changed = lightnessHasChanged(i, current);
	    if (changed) 
		nChanged ++;
	    
	    // Full opacity for changes.
	    data[j + 3] = 255 * lightnessHasChanged(i, current);
	    
	    // Store current lightness value.
	    buffer[i] = current;
	}
	f++;

	analyser.getByteTimeDomainData( buf );
	var size = 0;
	for (var i=0; i<buflen; i++) {
	    var foo = buf[i] - 128;
	    if (foo < 0)
		foo = -foo;
	    size += foo;
	}

	abuffer.push(Math.log(1+size)*100);

	if (abuffer.length > 3) {
	    var dsize = abuffer.shift();
	    aarray.push(dsize);
	    asum += dsize;
	    varray.push(nChanged);
	    vsum += nChanged;
	    psum += dsize * nChanged;
	    
//	    bd.process(curtime(), buf);
//	    bd2.process(curtime, nChanged);
	    
	    times2.append(new Date().getTime(), dsize);
	    times.append(new Date().getTime(), nChanged);
	}
	
	if (aarray.length > 50) {
	    var oldsize = aarray.shift();
	    var oldnChanged = varray.shift();
	    asum -= oldsize;
	    vsum -= oldnChanged;
	    psum -= oldsize*oldnChanged;
	    
	    var score = psum*40000/(vsum*asum);

	    var dft = new DFT(50, 10);
	    dft.forward(aarray);
	    var spectrum = dft.spectrum;
	    foo = spectrum;

	    var dft2 = new DFT(50, 10);
	    dft2.forward(varray);
	    var spectrum2 = dft2.spectrum;
	    
/*	    var abpm;
	    var vbpm;
	    var besti = 0;
	    var bestvalue = 0;

	    for (var i=10; i < spectrum.length; i++) {
		if (spectrum[i] > bestvalue) {
		    besti = i;
		    bestvalue = spectrum[i];
		}
	    }
	    abpm = Math.round(3 * besti * framerate / 10);
	    
	    bestvalue = 0;
	    besti = 0;

	    for (var i=10; i < spectrum2.length; i++) {
		if (spectrum2[i] > bestvalue) {
		    besti = i;
		    bestvalue = spectrum2[i];
		}
	    }
	    vbpm = Math.round(3 * besti * framerate / 10);
*/

	    var score;
	    var asum = 0;
	    var vsum = 0;
	    var psum = 0;

	    for (var i=4; i<spectrum.length; i++) {
		asum += spectrum[i];
		vsum += spectrum2[i];
		psum += spectrum[i] * spectrum2[i];
	    }

	    var canvasEl = document.getElementById('acanvas'),
	    ctx     = canvasEl.getContext( '2d' ),
	    h       = canvasEl.height,
	    w       = canvasEl.width,
	    width   = 8,
	    spacing = 0,
	    count   = 100;
	    
	    ctx.fillStyle = "black";

	    ctx.clearRect( 0, 0, w, h );
	    for ( var i = 6, l = spectrum.length; i < l && i < count; i++ ) {
		ctx.fillRect( i * ( spacing + width ), h, width, -Math.round(spectrum[i]/150 * h) );
//		console.log(i * ( spacing + width ), h, width, spectrum[i]/1500 * h);
	    }


	    canvasEl = document.getElementById('vcanvas');
	    ctx     = canvasEl.getContext( '2d' );
	    ctx.fillStyle = "black";

	    ctx.clearRect( 0, 0, w, h );
	    for ( var i = 6, l = spectrum2.length; i < l && i < count; i++ ) {
		ctx.fillRect( i * ( spacing + width ), h, width, -Math.round(spectrum2[i]/350 * h) );
//		console.log(i * ( spacing + width ), h, width, spectrum[i]/1500 * h);
	    }

	    score = 900*psum /asum/vsum;
	    totalscore += score;
	    scorebuffer.push(score);
	    
	    if (scorebuffer.length > 50) {
		totalscore -= scorebuffer.shift();
		div.innerHTML = "Score: " + Math.round(totalscore/50);
	    }

	    
	}
	
    }

    function lightnessHasChanged(index, value) {
	return buffers.some(function (buffer) {
	    return Math.abs(value - buffer[index]) >= 15;
	});
    }

    function lightnessValue(r, g, b) {
	return (Math.min(r, g, b) + Math.max(r, g, b)) / 255 * 50;
    }

    addEventListener("DOMContentLoaded", initialize);
})(document, navigator);
