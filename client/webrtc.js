var localVideo;

var localStream;
var myName;
var remoteVideo;
var remoteStream;
var yourConn;
var uuid;
var serverConnection;
var connectionState;
var streams = [];

var name;
var connectedUser;
let pendingCandidates = [];

var peerConnectionConfig = {
  iceServers: [
    { urls: "stun:stun.stunprotocol.org:3478" },
    { urls: "stun:stun.l.google.com:19302" },
  ],
};

// serverConnection = new WebSocket("wss://" + window.location.hostname + ":9002");
serverConnection = new WebSocket("wss://" + window.location.hostname);

serverConnection.onopen = function () {
  console.log("Connected to the signaling server");
};

serverConnection.onmessage = gotMessageFromServer;

document.getElementById("otherElements").hidden = true;
var usernameInput = document.querySelector("#usernameInput");
var usernameShow = document.querySelector("#showLocalUserName");
var showAllUsers = document.querySelector("#allUsers");
var remoteUsernameShow = document.querySelector("#showRemoteUserName");
var loginBtn = document.querySelector("#loginBtn");
var callToUsernameInput = document.querySelector("#callToUsernameInput");
var callBtn = document.querySelector("#callBtn");
var hangUpBtn = document.querySelector("#hangUpBtn");

// Login when the user clicks the button
loginBtn.addEventListener("click", function (event) {
  name = usernameInput.value;
  usernameShow.innerHTML = "Hello, " + name;
  if (name.length > 0) {
    send({
      type: "login",
      name: name,
    });
  }
});

/* START: Register user for first time i.e. Prepare ground for webrtc call to happen */
function handleLogin(success, allUsers) {
  if (success === false) {
    alert("Ooops...try a different username");
  } else {
    var allAvailableUsers = allUsers.join();
    console.log("All available users", allAvailableUsers);
    showAllUsers.innerHTML = "Available users: " + allAvailableUsers;
    localVideo = document.getElementById("localVideo");
    remoteVideo = document.getElementById("remoteVideo");
    document.getElementById("myName").hidden = true;
    document.getElementById("otherElements").hidden = false;

    var constraints = {
      video: true,
      audio: true,
    };

    /* START:The camera stream acquisition */
    if (navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia(constraints)
        .then(getUserMediaSuccess)
        .catch(errorHandler);
    } else {
      alert("Your browser does not support getUserMedia API");
    }
    /* END:The camera stream acquisition */
  }
}
/* END: Register user for first time i.e. Prepare ground for webrtc call to happen */

function getUserMediaSuccess(stream) {
  localStream = stream;
  localVideo.srcObject = stream;
  yourConn = new RTCPeerConnection(peerConnectionConfig);

  connectionState = yourConn.connectionState;
  console.log("connection state inside getusermedia", connectionState);

  yourConn.onicecandidate = function (event) {
    console.log("event ==> ", event);
    console.log("onicecandidate inside getusermedia success", event.candidate);
    if (event.candidate) {
      console.log("yourConn.localDescription ==> ", yourConn.localDescription);
      if (yourConn.localDescription) {
        send({
          type: "candidate",
          candidate: event.candidate,
        });
      } else {
        // Add the candidate to the pending candidates array
        pendingCandidates.push(event.candidate);
        console.log("pendingCandidates in else ==> ", pendingCandidates);
      }
    }
  };

  yourConn.onsignalingstatechange = () => {
    console.log("onsignalingstatechange");
    console.log("pendingCandidates ==> ", pendingCandidates);
    console.log("yourConn.signalingState ===> ", yourConn.signalingState);
    if (yourConn.signalingState === "stable" && pendingCandidates.length > 0) {
      // Add all the pending candidates to the peer connection
      console.log(
        "if (yourConn.signalingState === 'stable' && pendingCandidates.length > 0) {"
      );
      pendingCandidates.forEach((candidate) => {
        console.log("Pending candiates loop");
        yourConn.addIceCandidate(candidate);
      });
      // Clear the pending candidates array
      pendingCandidates = [];
    }
  };
  yourConn.ontrack = gotRemoteStream;
  yourConn.addStream(localStream);
}

/* START: Initiate call to any user i.e. send message to server */
callBtn.addEventListener("click", function () {
  console.log("inside call button");

  var callToUsername = document.getElementById("callToUsernameInput").value;

  if (callToUsername.length > 0) {
    connectedUser = callToUsername;
    console.log("nameToCall", connectedUser);
    console.log("create an offer to-", connectedUser);

    var connectionState2 = yourConn.connectionState;
    console.log("connection state before call beginning", connectionState2);
    var signallingState2 = yourConn.signalingState;
    //console.log('connection state after',connectionState1)
    console.log("signalling state after", signallingState2);
    yourConn.createOffer(
      function (offer) {
        send({
          type: "offer",
          offer: offer,
        });

        yourConn.setLocalDescription(offer);
      },
      function (error) {
        alert("Error when creating an offer", error);
        console.log("Error when creating an offer", error);
      }
    );
    document.getElementById("callOngoing").style.display = "block";
    document.getElementById("callInitiator").style.display = "none";
  } else alert("username can't be blank!");
});
/* END: Initiate call to any user i.e. send message to server */

/* START: Recieved call from server i.e. recieve messages from server  */
function gotMessageFromServer(message) {
  console.log("Got message", message.data);
  var data = JSON.parse(message.data);

  switch (data.type) {
    case "login":
      handleLogin(data.success, data.allUsers);
      break;
    //when somebody wants to call us
    case "offer":
      console.log("inside offer");
      handleOffer(data.offer, data.name);
      break;
    case "answer":
      console.log("inside answer");
      handleAnswer(data.answer);
      break;
    //when a remote peer sends an ice candidate to us
    case "candidate":
      console.log("inside handle candidate");
      handleCandidate(data.candidate);
      break;
    case "leave":
      handleLeave();
      break;
    default:
      break;
  }

  serverConnection.onerror = function (err) {
    console.log("Got error", err);
  };
}

function send(msg) {
  //attach the other peer username to our messages
  if (connectedUser) {
    msg.name = connectedUser;
  }
  console.log("msg before sending to server", msg);
  serverConnection.send(JSON.stringify(msg));
}

function sendRecord(msg) {
  //attach the other peer username to our messages
  if (connectedUser) {
    msg.name = connectedUser;
  }
  console.log("msg before sending to server", msg);
  serverConnection.binaryType = "blob";
  serverConnection.send(msg);
}

/* START: Create an answer for an offer i.e. send message to server */
function handleOffer(offer, name) {
  document.getElementById("callInitiator").style.display = "none";
  document.getElementById("callReceiver").style.display = "block";

  /* Call answer functionality starts */
  answerBtn.addEventListener("click", function () {
    connectedUser = name;
    yourConn.setRemoteDescription(new RTCSessionDescription(offer));
    console.log("remote description set");

    //create an answer to an offer
    yourConn.createAnswer(
      function (answer) {
        yourConn.setLocalDescription(answer);

        send({
          type: "answer",
          answer: answer,
        });
      },
      function (error) {
        alert("Error when creating an answer");
      }
    );
    document.getElementById("callReceiver").style.display = "none";
    document.getElementById("callOngoing").style.display = "block";
  });
  /* Call answer functionality ends */
  /* Call decline functionality starts */
  declineBtn.addEventListener("click", function () {
    document.getElementById("callInitiator").style.display = "block";
    document.getElementById("callReceiver").style.display = "none";
  });

  /*Call decline functionality ends */
}

function gotRemoteStream(event) {
  console.log("got remote stream, event", event);
  remoteVideo.srcObject = event.streams[0];
  // remoteStream = event.streams[0];
  remoteStream = event.streams[0];
  streams = [...event.streams];
}

function errorHandler(error) {
  console.log(error);
}

//when we got an answer from a remote user
function handleAnswer(answer) {
  console.log("answer: ", answer);
  yourConn.setRemoteDescription(new RTCSessionDescription(answer));
}

//when we got an ice candidate from a remote user
function handleCandidate(candidate) {
  if (yourConn.remoteDescription) {
    console.log("candidate =>", candidate);
    yourConn.addIceCandidate(new RTCIceCandidate(candidate));
  } else {
    // Add the candidate to the pending candidates array
    pendingCandidates.push(candidate);
    console.log("pendingCandidates in else ==> ", pendingCandidates);
  }
}

//hang up
hangUpBtn.addEventListener("click", function () {
  send({
    type: "leave",
  });

  handleLeave();

  document.getElementById("callOngoing").style.display = "none";
  document.getElementById("callInitiator").style.display = "block";
});

function handleLeave() {
  connectedUser = null;
  remoteVideo.src = null;
  var connectionState = yourConn.connectionState;
  var signallingState = yourConn.signalingState;
  console.log("connection state before", connectionState);
  console.log("signalling state before", signallingState);
  yourConn.close();
  yourConn.onicecandidate = null;
  yourConn.onaddstream = null;
  var connectionState1 = yourConn.connectionState;
  var signallingState1 = yourConn.signalingState;
  console.log("connection state after", connectionState1);
  console.log("signalling state after", signallingState1);
}

//record

var btnStartRecording = document.querySelector("#btn-start-recording");
var btnStopRecording = document.querySelector("#btn-stop-recording");

var recorder;
var mediaStream = null;
var recordedChunks = [];
var mediaRecorder;

btnStartRecording.onclick = function () {
  // btnStartRecording.disabled = true;

  captureUserMedia(function (screenStream) {
    console.log("Inside captureUserMedia");
    mediaStream = screenStream;

    //remoteStream
    // const mergedStream = new MediaStream([...screenStream.getTracks(), ...remoteStream.getTracks()]);
    const mixer = new MultiStreamsMixer([screenStream, ...streams]);

    // yourConn.addStream(mixer.getMixedStream());

    mixer.frameInterval = 0;
    mixer.startDrawingFrames();

    // yourConn.onaddstream = function(event) {
    //   const mixedStream = event.stream;
    //   // Use the mixedStream here, e.g. attach it to a video element to display it
    // };
    mediaRecorder = new MediaRecorder(mixer.getMixedStream(), {
      mimeType: "video/webm; codecs=vp9,opus",
      videoBitsPerSecond: 2000000, // Set the desired bitrate (e.g., 2 Mbps)
      frameRate: 30, // Set the desired framerate (e.g., 30 frames per second)
    });

    mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    });
    mediaRecorder.start();

    // recorder = RecordRTC(mixer.getMixedStream(), {
    //   type: "video",
    //   mimeType: 'video/mp4; codecs=avc1.4D401E, mp4a.40.2'
    // });

    // recorder.startRecording();

    // enable stop-recording button
    // btnStopRecording.disabled = false;
  });
};

btnStopRecording.onclick = function () {
  mediaRecorder.addEventListener("stop", () => {
    const blob = new Blob(recordedChunks, { type: "video/webm" });
    sendRecord(blob);
  });

  mediaRecorder.stop();

  // recorder.stopRecording(postFiles);
};

function captureUserMedia(success_callback) {
  console.log("Inside captureUserMedia 2");
  var session = {
    audio: true,
    video: true,
  };
  navigator.mediaDevices.getUserMedia(session).then(success_callback);
}

function postFiles() {
  var blob = recorder.getBlob();
  console.log("blob  ==> ", blob);

  // const ws = new WebSocket(`ws://${window.document.location.host}`);
  // ws.binaryType = "blob";
  // Log socket opening and closing
  // ws.addEventListener("open", (event) => {
  //   console.log("Websocket connection opened");
  //   ws.send(blob);
  // });

  sendRecord(blob);
  if (mediaStream) mediaStream.stop();
}
