import { useContext, useState, useEffect, useRef } from 'react';
import { AppContext } from '../context/AppContext';
import { Play, Square, FastForward, Bus, MapPin, UserCheck, AlertTriangle, Radio, ShieldAlert, ScanLine, Landmark } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './DriverDashboard.css';
import { getCleanAddressName, parseAddress } from '../utils/geoUtils';
import jsQR from 'jsqr';
import * as faceapi from '@vladmandic/face-api';

export default function DriverDashboard() {
  const {
    currentUser, users, buses, routes, students, trips, parents, leaveRequests,
    startTrip, advanceTripStop, endTrip, markStudentAttendance, triggerEmergency, clearEmergency,
    triggerDeviation, clearDeviation, addNotification,
    pingGps, triggerEmergencySos, scanStudentQr, matchFace, registerFace,
    resolveEmergency
  } = useContext(AppContext);

  // Find driver assignments
  const driverId = currentUser.driverId || 'D1';
  const assignedBus = buses.find(b => String(b.driverId) === String(driverId));
  
  // Find if there is an active trip for this driver (or assigned bus)
  const activeTrip = trips.find(t => 
    (t.status === 'Active' || t.status === 'Emergency') &&
    (String(t.driverId) === String(driverId) || String(t.busId) === String(assignedBus?.busId))
  );

  // Let's resolve assignments cleanly
  // If there's an active trip, use the optimized bus and route from that active trip
  const busObj = activeTrip 
    ? (buses.find(b => String(b.busId) === String(activeTrip.busId)) || assignedBus || buses[0])
    : (assignedBus || buses[0]);
    
  const activeRoute = activeTrip
    ? (routes.find(r => String(r.routeId) === String(activeTrip.routeId)) || routes[0])
    : (routes.find(r => busObj && (String(r.routeId) === String(busObj.busId) || r.routeId === 1 || String(r.routeId) === '1')) || routes[0]);

  // List students assigned to this route
  const routeStudents = students.filter(s => s.routeId === activeRoute?.routeId);

  // GPS and Scanning states
  const [gpsCoords, setGpsCoords] = useState({ lat: 11.0168, lng: 76.9558 });
  const [gpsSpeed, setGpsSpeed] = useState(0);

  // Scanner Console state
  const [scannerMode, setScannerMode] = useState('QR'); // 'QR' or 'FACE'
  const [selectedStudentForScan, setSelectedStudentForScan] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatusMsg, setScanStatusMsg] = useState('');
  const [isRealScanner, setIsRealScanner] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [faceModelsLoaded, setFaceModelsLoaded] = useState(false);
  const [faceAction, setFaceAction] = useState('VERIFY'); // 'VERIFY' or 'REGISTER'

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanningLoopRef = useRef(null);

  // Map Refs
  const driverMapRef = useRef(null);
  const busMarkerRef = useRef(null);

  // Slide-to-Complete state
  const [slideValue, setSlideValue] = useState(0);

  // One-Tap SOS Countdown states
  const [sosReason, setSosReason] = useState('Breakdown');
  const [sosCountdown, setSosCountdown] = useState(0);
  const [sosTimerActive, setSosTimerActive] = useState(false);

  // Auto-Delay detection states
  const [lastAutoDelayStop, setLastAutoDelayStop] = useState(-1);
  const [autoDelayBroadcasted, setAutoDelayBroadcasted] = useState(false);

  // Calculate boarded count at component level for HUD and SOS triggers
  const boardedCount = activeTrip
    ? students.filter(s => {
        const att = trips.find(t => t.tripId === activeTrip.tripId)?.logs || [];
        return att.some(l => l.includes(`${s.name} marked Boarded`));
      }).length
    : 0;

  // GPS Telemetry pinging
  useEffect(() => {
    if (!activeTrip || (activeTrip.status !== 'Active' && activeTrip.status !== 'Emergency')) return;

    let watchId = null;
    let simInterval = null;

    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const speed = pos.coords.speed !== null ? pos.coords.speed * 3.6 : 35.0; // speed in km/h
          setGpsCoords({ lat, lng });
          setGpsSpeed(speed);
          pingGps(activeTrip.tripId, lat, lng, speed);
        },
        (err) => {
          console.warn("Geolocation watch failed, fallback to OSRM simulator:", err);
          startSimulation();
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    } else {
      startSimulation();
    }

    function startSimulation() {
      if (!activeRoute || !activeRoute.stops) return;
      const parsedStops = activeRoute.stops.map(s => parseAddress(s));
      let stopIdx = activeTrip.currentStopIndex;
      let step = 0;

      simInterval = setInterval(() => {
        const currentStop = parsedStops[stopIdx];
        const nextStop = parsedStops[Math.min(stopIdx + 1, parsedStops.length - 1)];

        if (currentStop && nextStop) {
          const progress = step / 5.0;
          const lat = currentStop.coords[0] + (nextStop.coords[0] - currentStop.coords[0]) * progress;
          const lng = currentStop.coords[1] + (nextStop.coords[1] - currentStop.coords[1]) * progress;
          const speed = step === 0 ? 0.0 : 38.0 + Math.random() * 8.0;

          setGpsCoords({ lat, lng });
          setGpsSpeed(speed);
          pingGps(activeTrip.tripId, lat, lng, speed);

          step = (step + 1) % 6;
          if (step === 0) {
            stopIdx = (stopIdx + 1) % parsedStops.length;
          }
        }
      }, 5000);
    }

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (simInterval) clearInterval(simInterval);
    };
  }, [activeTrip?.tripId, activeTrip?.status, activeTrip?.currentStopIndex]);

  // Stop hold time states
  const [stopTimeSeconds, setStopTimeSeconds] = useState(0);
  const [delayMessage, setDelayMessage] = useState('');
  const [showManualDelayForm, setShowManualDelayForm] = useState(false);

  // Track hold time at current stop
  useEffect(() => {
    let interval = null;
    if (activeTrip && activeTrip.status === 'Active') {
      setStopTimeSeconds(0);
      interval = setInterval(() => {
        setStopTimeSeconds(prev => prev + 1);
      }, 1000);
    } else {
      setStopTimeSeconds(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeTrip?.tripId, activeTrip?.currentStopIndex, activeTrip?.status]);

  // Set default message when stop hold exceeds 10 minutes (600 seconds)
  useEffect(() => {
    if (stopTimeSeconds >= 600 && activeTrip && activeRoute && !delayMessage) {
      const currentStop = getCleanAddressName(activeRoute.stops[activeTrip.currentStopIndex]);
      setDelayMessage(`The school bus is currently held at stop "${currentStop}" for more than 10 minutes. Expect a delay in transit.`);
    }
  }, [stopTimeSeconds, activeTrip, activeRoute, delayMessage]);

  // Auto-Delay Auto-Detection (Stationary > 4 minutes / 240 seconds)
  useEffect(() => {
    if (activeTrip && activeRoute && stopTimeSeconds >= 240 && lastAutoDelayStop !== activeTrip.currentStopIndex) {
      const currentStopName = getCleanAddressName(activeRoute.stops[activeTrip.currentStopIndex]);
      const autoMsg = `Auto-Alert: Bus #${busObj.busNumber} has been stationary at stop "${currentStopName}" for over 4 minutes. Expect traffic delays.`;
      
      const routeParentIds = [...new Set(routeStudents.map(s => s.parentId))];
      const parentUsers = users.filter(u => u.parentId && routeParentIds.includes(u.parentId));
      
      parentUsers.forEach(pUser => {
        addNotification(pUser.userId, autoMsg, 'Delay Alert');
      });

      addNotification(currentUser.userId, `System auto-broadcasted delay alert for stop: ${currentStopName}`, 'System Alert');

      setLastAutoDelayStop(activeTrip.currentStopIndex);
      setAutoDelayBroadcasted(true);
    }
  }, [stopTimeSeconds, activeTrip, activeRoute, lastAutoDelayStop]);

  // Reset delay message state when current stop index changes
  useEffect(() => {
    setDelayMessage('');
    setShowManualDelayForm(false);
    setAutoDelayBroadcasted(false);
  }, [activeTrip?.currentStopIndex]);

  const handleBroadcastDelay = async () => {
    if (!delayMessage || !delayMessage.trim()) {
      alert('Please enter a message to send.');
      return;
    }

    // Find unique parentIds of students on this route
    const routeParentIds = [...new Set(routeStudents.map(s => s.parentId))];
    
    // Find matching users
    const parentUsers = users.filter(u => u.parentId && routeParentIds.includes(u.parentId));

    if (parentUsers.length === 0) {
      alert('No parent user accounts found for this route.');
      return;
    }

    try {
      for (const pUser of parentUsers) {
        await addNotification(pUser.userId, delayMessage, 'Delay Alert');
      }
      alert(`Successfully sent delay alert to ${parentUsers.length} parents!`);
      setDelayMessage('');
      setShowManualDelayForm(false);
      setStopTimeSeconds(0);
    } catch (e) {
      console.error(e);
      alert('Failed to send delay broadcast.');
    }
  };

  // Live GPS Map Sync
  useEffect(() => {
    // Clean up map if there's no active trip
    if (!activeTrip || (activeTrip.status !== 'Active' && activeTrip.status !== 'Emergency')) {
      if (driverMapRef.current) {
        try { driverMapRef.current.remove(); } catch (e) {}
        driverMapRef.current = null;
        busMarkerRef.current = null;
      }
      return;
    }

    const container = document.getElementById("driver-live-map");
    if (!container) return;

    // Initialize map if not yet done
    if (!driverMapRef.current) {
      const map = L.map('driver-live-map', { zoomControl: false }).setView([gpsCoords.lat, gpsCoords.lng], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
      driverMapRef.current = map;
    }

    const map = driverMapRef.current;

    // Clear old layers
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker || layer instanceof L.Polyline) {
        try { map.removeLayer(layer); } catch (e) {}
      }
    });

    // Draw route path and stops markers
    if (activeRoute && activeRoute.stops) {
      const coords = [];
      activeRoute.stops.forEach((stop, index) => {
        const parsed = parseAddress(stop);
        if (parsed && parsed.coords) {
          coords.push(parsed.coords);
          const stopMarker = L.marker(parsed.coords, {
            icon: L.divIcon({
              className: 'custom-stop-marker',
              html: `<div style="background-color: #3b82f6; color: white; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${index + 1}</div>`,
              iconSize: [22, 22],
              iconAnchor: [11, 11]
            })
          }).addTo(map);
          stopMarker.bindTooltip(`Stop ${index + 1}: ${parsed.name}`, { permanent: false });
        }
      });

      // Draw polyline
      if (coords.length > 1) {
        L.polyline(coords, { color: '#3b82f6', weight: 4, opacity: 0.8, dashArray: '6, 6' }).addTo(map);
      }
    }

    // Add live bus marker
    const busIcon = L.divIcon({
      className: 'live-bus-marker',
      html: `<div style="background-color: #eab308; color: black; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; border: 2px solid white; box-shadow: 0 0 12px #eab308; animation: pulse-bus 2s infinite;">🚌</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    const busMarker = L.marker([gpsCoords.lat, gpsCoords.lng], { icon: busIcon }).addTo(map);
    busMarkerRef.current = busMarker;
    map.setView([gpsCoords.lat, gpsCoords.lng], 14);

  }, [activeTrip?.tripId, activeRoute]);

  // Update bus position smoothly when coordinates change
  useEffect(() => {
    if (driverMapRef.current && busMarkerRef.current) {
      busMarkerRef.current.setLatLng([gpsCoords.lat, gpsCoords.lng]);
      driverMapRef.current.panTo([gpsCoords.lat, gpsCoords.lng]);
    }
  }, [gpsCoords]);

  const handleTriggerSos = async (reasonText) => {
    if (!activeTrip) return;
    try {
      await triggerEmergencySos(
        activeTrip.tripId, 
        reasonText || 'Mechanical Breakdown', 
        gpsCoords.lat, 
        gpsCoords.lng, 
        boardedCount
      );
      setSosTimerActive(false);
      setSosCountdown(0);
    } catch (e) {
      console.error(e);
      alert('Failed to trigger SOS alert.');
    }
  };

  // One-Tap SOS Countdown timer handler
  useEffect(() => {
    let interval = null;
    if (sosTimerActive && sosCountdown > 0) {
      interval = setInterval(() => {
        setSosCountdown(prev => prev - 1);
      }, 1000);
    } else if (sosTimerActive && sosCountdown === 0) {
      // Trigger SOS automatically
      handleTriggerSos(sosReason);
      setSosTimerActive(false);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [sosTimerActive, sosCountdown, sosReason]);

  const handleStartSosCountdown = () => {
    setSosReason('Breakdown');
    setSosCountdown(3);
    setSosTimerActive(true);
  };

  const handleSlideChange = (e) => {
    setSlideValue(Number(e.target.value));
  };

  const handleSlideEnd = () => {
    if (slideValue >= 95) {
      endTrip(activeTrip.tripId);
      setSlideValue(0);
    } else {
      // Snapping back animation loop
      let val = slideValue;
      const snapInterval = setInterval(() => {
        if (val <= 0) {
          clearInterval(snapInterval);
          setSlideValue(0);
        } else {
          val = Math.max(0, val - 15);
          setSlideValue(val);
        }
      }, 20);
    }
  };

  const handleStart = () => {
    if (!activeRoute || !busObj) {
      alert('Missing assigned route or bus!');
      return;
    }
    startTrip(activeRoute.routeId, busObj.busId, driverId);
  };

  const handleNextStop = () => {
    if (!activeTrip) return;
    advanceTripStop(activeTrip.tripId);
  };

  const handleEnd = () => {
    if (!activeTrip) return;
    if (confirm('Are you sure you want to end this trip? All telemetry logs will be saved.')) {
      endTrip(activeTrip.tripId);
    }
  };



  const handleClearSos = async () => {
    if (!activeTrip) return;
    try {
      // Look up current open emergencies for this trip to resolve
      const res = await fetch(`http://localhost:8081/api/emergency/active`);
      if (res.ok) {
        const activeEms = await res.json();
        const tripEm = activeEms.find(e => e.tripId === activeTrip.tripId);
        if (tripEm) {
          await resolveEmergency(tripEm.emergencyId, "Emergency cleared, transport resumed.");
        } else {
          // fallback
          clearEmergency(activeTrip.tripId);
        }
      } else {
        clearEmergency(activeTrip.tripId);
      }
    } catch (e) {
      clearEmergency(activeTrip.tripId);
    }
  };

  const handleTriggerDeviation = () => {
    if (!activeTrip) return;
    const reason = prompt('Please enter route deviation details:', 'Simulated GPS drift - 500m off-route');
    if (reason && reason.trim()) {
      triggerDeviation(activeTrip.tripId, reason);
    }
  };

  const handleClearDeviation = () => {
    if (!activeTrip) return;
    clearDeviation(activeTrip.tripId);
  };

  const handlePerformScan = async () => {
    if (!selectedStudentForScan) {
      alert("Please select a passenger first to simulate scanning!");
      return;
    }

    setIsScanning(true);
    setScanStatusMsg("Initializing camera interface...");

    setTimeout(() => {
      setScanStatusMsg(scannerMode === 'QR' ? "Capturing QR Matrix..." : "Extracting Facial Landmarks...");
    }, 600);

    setTimeout(async () => {
      try {
        if (scannerMode === 'QR') {
          const qrToken = `QR-STUDENT-${selectedStudentForScan}`;
          const res = await scanStudentQr(qrToken);
          if (res.success) {
            const studentName = students.find(s => s.studentId === Number(selectedStudentForScan))?.name || "Student";
            setScanStatusMsg(`✅ Credential Verified! ${studentName} marked ${res.event.status}.`);
          } else {
            setScanStatusMsg(`❌ Verification Failed: ${res.message}`);
          }
        } else {
          // Biometric match simulation using deterministic vector based on student ID
          const baseVal = (Number(selectedStudentForScan) * 0.05).toFixed(4);
          const vector = Array.from({ length: 128 }, (_, i) => (Number(baseVal) + Math.random() * 0.005).toFixed(4)).toString();
          
          if (faceAction === 'REGISTER') {
            await registerFace(selectedStudentForScan, `[${vector}]`);
            const studentName = students.find(s => s.studentId === Number(selectedStudentForScan))?.name || "Student";
            setScanStatusMsg(`✅ Simulated Template Registered! ${studentName}'s face is enrolled.`);
          } else {
            const res = await matchFace(`[${vector}]`);
            if (res.success) {
              const studentName = students.find(s => s.studentId === Number(selectedStudentForScan))?.name || "Student";
              setScanStatusMsg(`✅ Biometric Match: ${studentName} (97.8% Confidence). Status: ${res.event.status}.`);
            } else {
              setScanStatusMsg(`❌ Biometric Match Failed: ${res.message}`);
            }
          }
        }
      } catch (err) {
        setScanStatusMsg("❌ Transaction Timeout. Use manual override.");
      } finally {
        setIsScanning(false);
      }
    }, 1800);
  };

  const startRealFaceScanner = async () => {
    setIsRealScanner(true);
    setCameraError('');
    setScanStatusMsg('');
    setIsScanning(true);
    
    try {
      if (!faceModelsLoaded) {
        setScanStatusMsg('Loading biometric AI models (SsdMobilenetv1, FaceLandmark, FaceRecognition)...');
        const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model/';
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
        setFaceModelsLoaded(true);
      }
      
      setScanStatusMsg('Requesting camera permission...');
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' }
        });
      } catch (err) {
        console.warn("Failed to open user camera, falling back to simple video", err);
        stream = await navigator.mediaDevices.getUserMedia({
          video: true
        });
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        videoRef.current.play();
      }
      setIsScanning(false);
      setScanStatusMsg('Camera ready. Position face in target circle.');
    } catch (err) {
      console.error("Camera access or model loading failed", err);
      setCameraError('Initialization failed: ' + err.message);
      setScanStatusMsg('❌ Camera initialization failed.');
      setIsRealScanner(false);
      setIsScanning(false);
    }
  };

  const handleScanFaceReal = async () => {
    if (!selectedStudentForScan) {
      alert("Please select a passenger in the dropdown to simulate targeting!");
      return;
    }

    if (!videoRef.current) {
      alert("Video element not ready!");
      return;
    }

    setIsScanning(true);
    setScanStatusMsg("Extracting facial landmarks...");

    try {
      const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 });
      const detection = await faceapi.detectSingleFace(videoRef.current, options)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        setScanStatusMsg("❌ No face detected. Adjust lighting/positioning and try again.");
        setIsScanning(false);
        return;
      }

      const descriptor = detection.descriptor;
      const vector = `[${Array.from(descriptor).map(val => val.toFixed(4)).join(',')}]`;

      if (faceAction === 'REGISTER') {
        setScanStatusMsg("Enrolling face template in database...");
        await registerFace(selectedStudentForScan, vector);
        const studentName = students.find(s => s.studentId === Number(selectedStudentForScan))?.name || "Student";
        setScanStatusMsg(`✅ Biometric Template Saved! ${studentName}'s face is now enrolled.`);
      } else {
        setScanStatusMsg("Running Euclidean biometric match...");
        const res = await matchFace(vector);
        if (res.success) {
          const studentName = students.find(s => s.studentId === Number(selectedStudentForScan))?.name || "Student";
          setScanStatusMsg(`✅ Biometric Match Verified! ${studentName} marked ${res.event.status}.`);
          stopRealScanner();
        } else {
          setScanStatusMsg(`❌ Biometric Match Failed: ${res.message}`);
        }
      }
    } catch (err) {
      console.error("Face scan matching failed", err);
      setScanStatusMsg(`❌ Match Error: ${err.message || "Request timed out"}`);
    } finally {
      setIsScanning(false);
    }
  };

  const startRealScanner = async () => {
    setIsRealScanner(true);
    setCameraError('');
    setScanStatusMsg('');
    setIsScanning(true);
    setScanStatusMsg('Requesting camera permission...');
    
    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });
      } catch (err) {
        console.warn("Failed to open environment camera, falling back to simple video", err);
        stream = await navigator.mediaDevices.getUserMedia({
          video: true
        });
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        videoRef.current.play();
      }
      setScanStatusMsg('Scanning for QR code...');
      scanningLoopRef.current = requestAnimationFrame(tickScan);
    } catch (err) {
      console.error("Camera access failed", err);
      setCameraError('Camera access failed: ' + err.message);
      setScanStatusMsg('❌ Camera initialization failed.');
      setIsScanning(false);
      setIsRealScanner(false);
    }
  };

  const stopRealScanner = () => {
    setIsRealScanner(false);
    setIsScanning(false);
    setScanStatusMsg('');
    if (scanningLoopRef.current) {
      cancelAnimationFrame(scanningLoopRef.current);
      scanningLoopRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const tickScan = async () => {
    if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        });
        if (code) {
          const token = code.data;
          console.log("Decoded QR Code data:", token);
          
          if (scanningLoopRef.current) cancelAnimationFrame(scanningLoopRef.current);
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
          }
          if (videoRef.current) videoRef.current.srcObject = null;
          
          setIsScanning(true);
          setScanStatusMsg("Capturing QR Matrix...");
          
          setTimeout(async () => {
            try {
              const res = await scanStudentQr(token);
              if (res.success) {
                const parts = token.split("-");
                let studentId = null;
                for (const part of parts) {
                  if (/^\d+$/.test(part)) {
                    studentId = Number(part);
                    break;
                  }
                }
                const studentName = studentId 
                  ? (students.find(s => s.studentId === studentId)?.name || "Passenger")
                  : "Passenger";
                
                setScanStatusMsg(`✅ Credential Verified! ${studentName} marked ${res.event.status}.`);
              } else {
                setScanStatusMsg(`❌ Verification Failed: ${res.message}`);
              }
            } catch (err) {
              setScanStatusMsg("❌ Transaction Failed. Please try again.");
            } finally {
              setIsScanning(false);
              setIsRealScanner(false);
            }
          }, 1000);
          return;
        }
      }
    }
    scanningLoopRef.current = requestAnimationFrame(tickScan);
  };

  useEffect(() => {
    return () => {
      if (scanningLoopRef.current) {
        cancelAnimationFrame(scanningLoopRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return (
    <div className="dashboard-content" role="region" aria-label="Driver Dashboard Console">
      <div className="dashboard-title-bar">
        <div>
          <h2>Driver Transit Console</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
            Active Bus: <strong>{busObj ? busObj.busNumber : 'None'}</strong> | 
            Assigned Route: <strong>{activeRoute ? activeRoute.routeName : 'None'}</strong>
          </p>
        </div>
      </div>

      {!busObj || !activeRoute ? (
        <section className="card-panel" style={{ textAlign: 'center', padding: '3rem' }} aria-label="No Driver Assignment Status">
          <AlertTriangle size={48} color="var(--warning)" style={{ marginBottom: '1rem' }} aria-hidden="true" />
          <h3>No Driver Assignment Detected</h3>
          <p>Please contact school administration to assign you a bus and route.</p>
        </section>
      ) : (
        <>
          {/* Telemetry HUD */}
          {activeTrip && (
            <div className="telemetry-hud" role="status" aria-label="Trip Telemetry HUD">
              <div className="hud-card">
                <div className="hud-label">Current Speed</div>
                <div className="hud-value speed">{gpsSpeed.toFixed(0)} <span className="hud-unit">km/h</span></div>
              </div>
              <div className="hud-card">
                <div className="hud-label">Active Stop</div>
                <div className="hud-value stop">
                  {getCleanAddressName(activeRoute.stops[activeTrip.currentStopIndex])}
                  <span className="hud-subtext">Stop {activeTrip.currentStopIndex + 1} of {activeRoute.stops.length}</span>
                </div>
              </div>
              <div className="hud-card">
                <div className="hud-label">Boarding & Distance</div>
                <div className="hud-value progress">
                  {boardedCount} / {routeStudents.length} <span className="hud-unit">Students</span>
                  <span className="hud-subtext">{activeTrip.distanceCovered} covered (Est: {activeRoute.distance})</span>
                </div>
              </div>
              <div className="hud-card">
                <div className="hud-label">Stop Hold Time</div>
                <div className="hud-value timer">
                  <span>{Math.floor(stopTimeSeconds / 60)}m {stopTimeSeconds % 60}s</span>
                  <div className="hud-actions">
                    <button 
                      className="hud-btn"
                      onClick={() => setStopTimeSeconds(prev => prev + 600)}
                      title="Simulate adding 10 minutes to hold time"
                      aria-label="Simulate adding ten minutes to hold time"
                    >
                      +10m
                    </button>
                    <button 
                      className="hud-btn"
                      onClick={() => {
                        const currentStop = getCleanAddressName(activeRoute.stops[activeTrip.currentStopIndex]);
                        setDelayMessage(`The school bus is currently held at stop "${currentStop}" due to unexpected traffic. Expect a delay in arrival times.`);
                        setShowManualDelayForm(true);
                      }}
                      aria-label="Write a manual delay notification broadcast message for parents"
                    >
                      Delay Msg
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="driver-dashboard-grid">
            {/* Column 1: Trip Operations & Logs */}
            <div className="dashboard-column">
              <section className="card-panel" aria-label="Transit Trip Controls" style={{ marginBottom: '1.5rem' }}>
                <h3 className="card-title">Trip Controls</h3>
                
                {activeTrip && activeTrip.status === 'Emergency' && (
                  <div role="alert" aria-live="assertive" style={{ border: '2px dashed red', backgroundColor: '#fee2e2', color: '#991b1b', padding: '1rem', borderRadius: '6px', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', animation: 'pulse 1.5s infinite' }}>
                    <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>🚨</span> EMERGENCY SOS ALERTS ACTIVE
                    </div>
                    <div style={{ fontSize: '0.8rem' }}>
                      School office and all parents on the route have been alerted.
                    </div>
                    <button className="btn btn-primary" onClick={handleClearSos} aria-label="Resolve emergency alert and resume trip" style={{ marginTop: '0.5rem', backgroundColor: '#1e3a8a', borderColor: '#1e3a8a', padding: '0.5rem 1rem' }}>
                      Clear SOS & Resume Trip
                    </button>
                  </div>
                )}

                {activeTrip && activeTrip.routeDeviated && (
                  <div role="alert" aria-live="assertive" style={{ border: '2px dashed #d97706', backgroundColor: '#fffbeb', color: '#b45309', padding: '1rem', borderRadius: '6px', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', animation: 'pulse 1.5s infinite' }}>
                    <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>⚠️</span> ROUTE DEVIATION DETECTED (GEOFENCE BREACH)
                    </div>
                    <div style={{ fontSize: '0.85rem', fontWeight: '600' }}>
                      Bus has drifted off the scheduled route path.
                    </div>
                    <button className="btn btn-warning" onClick={handleClearDeviation} aria-label="Return to route and clear deviation status alert" style={{ marginTop: '0.5rem', alignSelf: 'flex-start', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
                      Return to Route (Clear Alert)
                    </button>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }} role="group" aria-label="Transit operation buttons">
                  {!activeTrip ? (
                    <button className="btn btn-success" onClick={handleStart} style={{ padding: '0.75rem 1.25rem' }} aria-label="Start active bus route dispatch trip">
                      <Play size={18} aria-hidden="true" /> Start Dispatch Trip
                    </button>
                  ) : (
                    <>
                      {activeTrip.status !== 'Emergency' && (
                        <button className="btn btn-info" onClick={handleNextStop} style={{ padding: '0.75rem 1.25rem' }} aria-label={`Arrived at next stop: ${getCleanAddressName(activeRoute.stops[activeTrip.currentStopIndex])}`}>
                          <FastForward size={18} aria-hidden="true" /> Arrived at Next Stop
                        </button>
                      )}
                      
                      {/* Swipe slider to complete trip */}
                      <div className="slide-to-complete-container">
                        <div className="slide-track" style={{ opacity: slideValue > 70 ? 0.2 : 1 }}>
                          {slideValue > 15 ? 'Keep sliding...' : 'Swipe to Complete ➔'}
                        </div>
                        <input 
                          type="range" 
                          min="0" 
                          max="100" 
                          value={slideValue} 
                          onChange={handleSlideChange} 
                          onMouseUp={handleSlideEnd}
                          onTouchEnd={handleSlideEnd}
                          className="slide-handle-input"
                          aria-label="Slide thumb to the right to complete trip"
                        />
                      </div>

                      {activeTrip.status !== 'Emergency' && (
                        activeTrip.routeDeviated ? (
                          <button className="btn btn-warning" onClick={handleClearDeviation} style={{ padding: '0.75rem 1.25rem' }} aria-label="Clear active route deviation status">
                            ⚠️ Clear Deviation
                          </button>
                        ) : (
                          <button className="btn btn-warning" onClick={handleTriggerDeviation} style={{ padding: '0.75rem 1.25rem' }} aria-label="Simulate route deviation event">
                            ⚠️ Simulate Deviation
                          </button>
                        )
                      )}
                    </>
                  )}
                </div>
              </section>

              {activeTrip && (
                <section className="card-panel" style={{ padding: '1.25rem', marginBottom: '1.5rem' }} aria-label="Live GPS Transit Map">
                  <h3 className="card-title" style={{ fontSize: '1.05rem', marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1px dashed var(--border-color)' }}>
                    🗺️ Live GPS Transit Map
                  </h3>
                  <div id="driver-live-map" style={{ height: '230px', borderRadius: '8px', zIndex: 1 }}></div>
                </section>
              )}

              {activeTrip && autoDelayBroadcasted && (
                <div role="alert" aria-live="polite" style={{ border: '1px solid #d97706', backgroundColor: 'rgba(217, 119, 6, 0.08)', color: '#d97706', padding: '1rem', borderRadius: '10px', marginBottom: '1.5rem', fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>⚠️</span> SYSTEM AUTO-ALERT: Broadcasted traffic delay logs to route parents automatically (held stationary for &gt; 4m).
                </div>
              )}

              {activeTrip && (stopTimeSeconds >= 600 || showManualDelayForm) && (
                <section className="card-panel" style={{ border: '2px solid var(--warning)', backgroundColor: 'rgba(217, 119, 6, 0.08)', padding: '1.5rem', borderRadius: '16px', marginBottom: '1.5rem' }} role="region" aria-label="Stop Delay Broadcaster">
                  <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--warning)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                    <span>⚠️</span> Stop Hold Delay Warning
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                    {stopTimeSeconds >= 600 
                      ? `Bus has been holding at the current stop for over ${Math.floor(stopTimeSeconds / 60)} minutes. Broadcast an update to parents:`
                      : "Send custom delay update to parents on this route:"}
                  </div>
                  
                  <textarea 
                    value={delayMessage}
                    onChange={(e) => setDelayMessage(e.target.value)}
                    placeholder="Enter delay details..."
                    aria-label="Delay notification message details text"
                    style={{ 
                      width: '100%', 
                      height: '70px', 
                      padding: '0.5rem', 
                      fontSize: '0.8rem', 
                      borderRadius: '6px', 
                      border: '1px solid var(--border-color)', 
                      backgroundColor: 'var(--bg-color)', 
                      color: 'var(--text-main)',
                      marginBottom: '0.75rem',
                      resize: 'none',
                      outline: 'none'
                    }}
                  />
                  
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button 
                      className="btn btn-warning btn-sm" 
                      onClick={handleBroadcastDelay}
                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                      aria-label="Broadcast alert message to all parents on route"
                    >
                      ✉️ Broadcast Alert
                    </button>
                    <button 
                      className="btn btn-secondary btn-sm" 
                      onClick={() => {
                        setShowManualDelayForm(false);
                        setStopTimeSeconds(0);
                      }}
                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--text-muted)', borderColor: 'var(--border-color)', backgroundColor: 'transparent' }}
                      aria-label="Cancel delay broadcast"
                    >
                      Dismiss
                    </button>
                  </div>
                </section>
              )}

              <section className="card-panel" aria-label="Activity Console Logs">
                <h3 className="card-title">Activity Console Log</h3>
                <div className="terminal-console" role="log" aria-live="polite" aria-label="Activity Console Logs" style={{ overflowY: 'auto' }}>
                  {activeTrip ? (
                    [...activeTrip.logs].reverse().map((log, idx) => (
                      <div key={idx} className="console-line">
                        <span className="console-timestamp">[{new Date(activeTrip.startTime).toLocaleTimeString()}]</span>
                        {log}
                      </div>
                    ))
                  ) : (
                    <div className="console-line" style={{ color: '#8e8e93' }}>Console ready. Start a trip to capture event logs...</div>
                  )}
                </div>
              </section>
            </div>

            {/* Column 2: Passenger Attendance Checklist */}
            <div className="dashboard-column">
              <section className="card-panel" aria-label="Student Passenger Checklist">
                <h3 className="card-title">
                  <span><UserCheck size={18} style={{ verticalAlign: 'middle', marginRight: '4px' }} aria-hidden="true" /> Passenger Checklist</span>
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                  Mark students boarding/dropped during active transit. Updates parent dashboards in real time:
                </p>

                {routeStudents.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
                    No students assigned to this route.
                  </div>
                ) : (
                  <div className="student-checklist" role="list" aria-label="Assigned Route Passengers">
                    {routeStudents.map(student => {
                      const parent = parents.find(p => p.parentId === student.parentId);
                      return (
                        <div key={student.studentId} className="checklist-item" role="listitem">
                          <div>
                            <strong style={{ fontSize: '0.9rem' }}>{student.name}</strong>
                            {parent && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--primary-color)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                <span aria-hidden="true">📞</span>
                                <a href={`tel:${parent.phone}`} aria-label={`Call Parent ${parent.name} at phone number ${parent.phone}`} style={{ color: 'var(--primary-color)', textDecoration: 'none' }}>
                                  {parent.name}: <strong>{parent.phone}</strong>
                                </a>
                              </div>
                            )}
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                              <MapPin size={10} style={{ display: 'inline', marginRight: '2px' }} aria-hidden="true" />
                              Stop: {getCleanAddressName(student.address)}
                            </div>
                          </div>
                          
                          <div className="checklist-actions" role="group" aria-label={`Attendance actions for student ${student.name}`}>
                            {(() => {
                              const todayStr = new Date().toISOString().split('T')[0];
                              const activeTripHour = activeTrip ? new Date(activeTrip.startTime).getHours() : new Date().getHours();
                              const currentTripPeriod = activeTripHour < 12 ? 'Morning' : 'Evening';
                              const isOnLeave = leaveRequests.some(l => {
                                if (l.studentId !== student.studentId || l.date !== todayStr || l.status !== 'Approved') {
                                  return false;
                                }
                                const tripType = l.tripType || 'Both';
                                return tripType === 'Both' || tripType === currentTripPeriod;
                              });
                              if (isOnLeave) {
                                return <span className="badge success" style={{ textTransform: 'uppercase', padding: '0.35rem 0.6rem' }}>On Leave Today</span>;
                              }
                              return (
                                <>
                                  <button 
                                    className="btn btn-sm btn-checklist-board"
                                    onClick={() => markStudentAttendance(student.studentId, 'Boarded')}
                                    disabled={!activeTrip || activeTrip.status === 'Emergency'}
                                    title={!activeTrip ? "Start a trip to mark attendance" : "Board student"}
                                    aria-label={`Mark student ${student.name} as boarded`}
                                  >
                                    Board
                                  </button>
                                  <button 
                                    className="btn btn-sm btn-checklist-drop"
                                    onClick={() => markStudentAttendance(student.studentId, 'Dropped')}
                                    disabled={!activeTrip || activeTrip.status === 'Emergency'}
                                    title={!activeTrip ? "Start a trip to mark attendance" : "Drop student"}
                                    aria-label={`Mark student ${student.name} as dropped`}
                                  >
                                    Drop
                                  </button>
                                  <button 
                                    className="btn btn-sm btn-checklist-absent"
                                    onClick={() => markStudentAttendance(student.studentId, 'Absent')}
                                    disabled={!activeTrip || activeTrip.status === 'Emergency'}
                                    title={!activeTrip ? "Start a trip to mark attendance" : "Mark absent"}
                                    aria-label={`Mark student ${student.name} as absent`}
                                  >
                                    Absent
                                  </button>
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>

            {/* Column 3: Smart Verification Console */}
            <div className="dashboard-column">
              <section className="card-panel">
                <h3 className="card-title" style={{ color: 'var(--primary-color)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ScanLine size={18} /> Smart Verification Console
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  Verify passenger boarding using biometric face recognition scans or smart QR badge scan simulations.
                </p>

                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                  <button 
                    className={`btn ${scannerMode === 'QR' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => { 
                      setScannerMode('QR'); 
                      setScanResult(null); 
                      setScanStatusMsg(''); 
                    }}
                    style={{ flex: 1, padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                  >
                    <ScanLine size={14} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> QR Badge Scanner
                  </button>
                  <button 
                    className={`btn ${scannerMode === 'FACE' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => { 
                      setScannerMode('FACE'); 
                      setScanResult(null); 
                      setScanStatusMsg(''); 
                      stopRealScanner(); 
                    }}
                    style={{ flex: 1, padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                  >
                    <Landmark size={14} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> Biometric Face ID
                  </button>
                </div>

                {/* Simulated / Real toggle for QR scanner */}
                {scannerMode === 'QR' && (
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                    <button
                      type="button"
                      className={`btn btn-sm ${!isRealScanner ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => stopRealScanner()}
                      style={{ flex: 1, padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                    >
                      Simulation Mode
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${isRealScanner ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => startRealScanner()}
                      style={{ flex: 1, padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                      disabled={!activeTrip}
                      title={!activeTrip ? "Start a trip first to enable camera" : "Activate camera feed"}
                    >
                      Webcam Mode
                    </button>
                  </div>
                )}

                {/* Simulated / Real toggle for Face ID scanner */}
                {scannerMode === 'FACE' && (
                  <>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <button
                        type="button"
                        className={`btn btn-sm ${!isRealScanner ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => stopRealScanner()}
                        style={{ flex: 1, padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                      >
                        Simulation Mode
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${isRealScanner ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => startRealFaceScanner()}
                        style={{ flex: 1, padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                        disabled={!activeTrip}
                        title={!activeTrip ? "Start a trip first to enable camera" : "Activate camera feed"}
                      >
                        Webcam Mode
                      </button>
                    </div>
                    {/* Face ID Action Toggle (Register vs Verify) */}
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', backgroundColor: 'rgba(255, 255, 255, 0.05)', padding: '4px', borderRadius: '6px' }}>
                      <button
                        type="button"
                        className={`btn btn-sm ${faceAction === 'VERIFY' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setFaceAction('VERIFY')}
                        style={{ flex: 1, padding: '0.35rem 0.75rem', fontSize: '0.75rem', border: 'none' }}
                      >
                        Verify Passenger
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${faceAction === 'REGISTER' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setFaceAction('REGISTER')}
                        style={{ flex: 1, padding: '0.35rem 0.75rem', fontSize: '0.75rem', border: 'none' }}
                      >
                        Register Face
                      </button>
                    </div>
                  </>
                )}

                {/* Viewfinder simulation */}
                <div style={{ 
                  height: '180px', 
                  backgroundColor: '#000', 
                  borderRadius: '8px', 
                  position: 'relative', 
                  overflow: 'hidden', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  border: '1px solid var(--border-color)',
                  marginBottom: '1rem'
                }}>
                  {/* Viewfinder HUD */}
                  <div style={{ position: 'absolute', top: '15px', left: '15px', borderLeft: '2px solid #fff', borderTop: '2px solid #fff', width: '15px', height: '15px', zIndex: 10 }} />
                  <div style={{ position: 'absolute', top: '15px', right: '15px', borderRight: '2px solid #fff', borderTop: '2px solid #fff', width: '15px', height: '15px', zIndex: 10 }} />
                  <div style={{ position: 'absolute', bottom: '15px', left: '15px', borderLeft: '2px solid #fff', borderBottom: '2px solid #fff', width: '15px', height: '15px', zIndex: 10 }} />
                  <div style={{ position: 'absolute', bottom: '15px', right: '15px', borderRight: '2px solid #fff', borderBottom: '2px solid #fff', width: '15px', height: '15px', zIndex: 10 }} />
                  
                  <video 
                    ref={videoRef} 
                    style={{ 
                      width: '100%', 
                      height: '100%', 
                      objectFit: 'cover', 
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      display: isRealScanner ? 'block' : 'none'
                    }}
                    playsInline
                    muted
                  />

                  {isRealScanner && scannerMode === 'FACE' && (
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      zIndex: 8,
                      pointerEvents: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      {/* Facial target oval */}
                      <div style={{
                        width: '100px',
                        height: '130px',
                        border: '2px dashed #10b981',
                        borderRadius: '50%',
                        boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)', // darken surrounding areas
                        position: 'relative'
                      }}>
                        {/* Target text */}
                        <div style={{
                          position: 'absolute',
                          bottom: '-25px',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          color: '#10b981',
                          fontSize: '0.6rem',
                          fontWeight: '800',
                          whiteSpace: 'nowrap',
                          letterSpacing: '0.05em'
                        }}>
                          ALIGN FACE
                        </div>
                      </div>

                      {/* Scanning landmarks dots (high tech green coordinates) */}
                      {isScanning && (
                        <div style={{
                          position: 'absolute',
                          width: '100px',
                          height: '130px',
                          display: 'grid',
                          gridTemplateColumns: 'repeat(4, 1fr)',
                          gap: '12px',
                          padding: '10px'
                        }}>
                          {Array.from({ length: 12 }).map((_, i) => (
                            <div 
                              key={i} 
                              style={{ 
                                width: '5px', 
                                height: '5px', 
                                backgroundColor: '#10b981', 
                                borderRadius: '50%', 
                                animation: `ping ${0.5 + i * 0.1}s infinite` 
                              }} 
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Scanner Laser effect */}
                  {isScanning && (
                    <div style={{ 
                      position: 'absolute', 
                      left: 0, 
                      right: 0, 
                      height: '2px', 
                      backgroundColor: scannerMode === 'QR' ? '#3b82f6' : '#10b981', 
                      boxShadow: scannerMode === 'QR' ? '0 0 10px #3b82f6' : '0 0 10px #10b981',
                      animation: 'scanEffect 1.5s infinite linear',
                      zIndex: 10
                    }} />
                  )}

                  {/* Video/Scanning Graphics */}
                  {!isRealScanner && (
                    scannerMode === 'QR' ? (
                      <div style={{ textAlign: 'center', color: '#3b82f6', zIndex: 5 }}>
                        <ScanLine size={48} className={isScanning ? 'animate-pulse' : ''} />
                        <div style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: '#fff' }}>CAMERA READY • ALIGNED GRID</div>
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', color: '#10b981', zIndex: 5 }}>
                        <Landmark size={48} className={isScanning ? 'animate-pulse' : ''} />
                        <div style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: '#fff' }}>FACE ID READY • MATRIX HUD</div>
                        {/* Simulated landmarks */}
                        {isScanning && (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', width: '60px', margin: '8px auto 0 auto' }}>
                            {Array.from({ length: 8 }).map((_, i) => (
                              <div key={i} style={{ width: '4px', height: '4px', backgroundColor: '#10b981', borderRadius: '50%', animation: 'ping 1s infinite' }} />
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  )}
                </div>

                {/* Simulator trigger controls */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {!isRealScanner ? (
                    <>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Choose Student to Simulate</label>
                        <select 
                          className="form-select" 
                          value={selectedStudentForScan} 
                          onChange={(e) => setSelectedStudentForScan(e.target.value)}
                          disabled={!activeTrip}
                        >
                          <option value="">-- Choose Passenger --</option>
                          {routeStudents.map(s => <option key={s.studentId} value={s.studentId}>{s.name}</option>)}
                        </select>
                      </div>

                      <button 
                        className="btn btn-primary"
                        onClick={handlePerformScan}
                        disabled={isScanning || !activeTrip || !selectedStudentForScan}
                        style={{ width: '100%', padding: '0.5rem' }}
                      >
                        {isScanning 
                          ? 'Analyzing Matrix...' 
                          : scannerMode === 'QR' 
                            ? 'Simulate QR Card Scan' 
                            : (faceAction === 'REGISTER' ? 'Simulate Face Registration' : 'Simulate Facial Match')}
                      </button>
                    </>
                  ) : (
                    scannerMode === 'QR' ? (
                      <div style={{ 
                        padding: '0.75rem', 
                        borderRadius: '6px', 
                        backgroundColor: 'rgba(59, 130, 246, 0.1)', 
                        border: '1px dashed rgba(59, 130, 246, 0.3)',
                        color: '#60a5fa',
                        fontSize: '0.80rem',
                        textAlign: 'center',
                        fontWeight: '600'
                      }}>
                        🎥 Webcam Active: Present physical QR code to your camera to scan automatically.
                      </div>
                    ) : (
                      <>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Select Student in Camera view</label>
                          <select 
                            className="form-select" 
                            value={selectedStudentForScan} 
                            onChange={(e) => setSelectedStudentForScan(e.target.value)}
                            disabled={!activeTrip}
                          >
                            <option value="">-- Choose Passenger --</option>
                            {routeStudents.map(s => <option key={s.studentId} value={s.studentId}>{s.name}</option>)}
                          </select>
                        </div>

                         <button 
                          className="btn btn-success"
                          onClick={handleScanFaceReal}
                          disabled={isScanning || !activeTrip || !selectedStudentForScan}
                          style={{ width: '100%', padding: '0.5rem', backgroundColor: '#10b981', borderColor: '#10b981', color: '#09090b', fontWeight: 'bold' }}
                        >
                          {isScanning 
                            ? (faceAction === 'REGISTER' ? 'Registering Face Template...' : 'Biometric Face ID Scan...') 
                            : (faceAction === 'REGISTER' ? 'Scan & Register Face Template' : 'Scan & Verify Face')}
                        </button>
                      </>
                    )
                  )}

                  {scanStatusMsg && (
                    <div style={{ 
                      padding: '0.75rem', 
                      borderRadius: '6px', 
                      fontSize: '0.8rem', 
                      fontWeight: 'bold', 
                      backgroundColor: scanStatusMsg.startsWith('✅') ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', 
                      color: scanStatusMsg.startsWith('✅') ? '#10b981' : '#ef4444', 
                      border: scanStatusMsg.startsWith('✅') ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)'
                    }}>
                      {scanStatusMsg}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </>
      )}

      {/* Floating emergency SOS button */}
      {activeTrip && activeTrip.status !== 'Emergency' && !sosTimerActive && (
        <button 
          className="btn btn-danger animate-pulse"
          onClick={handleStartSosCountdown}
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            boxShadow: '0 4px 15px rgba(220, 38, 38, 0.4)',
            zIndex: 9999,
            fontSize: '0.8rem',
            fontWeight: 'bold',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '2px',
            border: '2px solid #fff',
            cursor: 'pointer',
            backgroundColor: '#dc2626'
          }}
        >
          <Radio size={18} />
          <span>SOS</span>
        </button>
      )}

      {/* One-Tap Countdown SOS overlay modal */}
      {sosTimerActive && (
        <div className="modal-overlay" style={{ zIndex: 10000, backgroundColor: 'rgba(0, 0, 0, 0.94)' }}>
          <div className="modal-content" style={{ maxWidth: '440px', border: '2px solid #ef4444', textAlign: 'center', padding: '2rem', animation: 'sosPulseBg 1.5s infinite alternate' }}>
            <div style={{ color: '#ef4444', fontSize: '3rem', marginBottom: '0.5rem', animation: 'bounce 0.8s infinite' }}>🚨</div>
            <h2 style={{ color: '#ef4444', fontWeight: '900', fontSize: '1.6rem', margin: '0 0 0.5rem 0', letterSpacing: '-0.02em' }}>
              TRIGGERING SOS ALARM
            </h2>
            <div style={{ fontSize: '3.5rem', fontWeight: '950', color: '#ffffff', margin: '0.75rem 0' }}>
              {sosCountdown}s
            </div>
            <p style={{ fontSize: '0.82rem', color: '#cbd5e1', marginBottom: '1.25rem', lineHeight: '1.4' }}>
              Broadcasting emergency coordinate logs immediately to dispatchers and notifying all parents of <strong>{sosReason}</strong>.
            </p>
            
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                Distress Category:
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                {['Accident', 'Breakdown', 'Medical Emergency', 'Security Threat'].map(r => (
                  <button 
                    key={r} 
                    className="btn btn-sm"
                    style={{ 
                      backgroundColor: sosReason === r ? '#ef4444' : 'rgba(255, 255, 255, 0.08)', 
                      color: '#ffffff', 
                      borderColor: sosReason === r ? '#ef4444' : 'rgba(255, 255, 255, 0.2)',
                      fontSize: '0.7rem',
                      padding: '0.35rem 0.65rem'
                    }}
                    onClick={() => setSosReason(r)}
                  >
                    {r.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => setSosTimerActive(false)} 
                style={{ flex: 1, backgroundColor: '#334155', borderColor: '#475569', color: '#ffffff' }}
              >
                Cancel Alert
              </button>
              <button 
                className="btn btn-danger" 
                onClick={() => handleTriggerSos(sosReason)} 
                style={{ flex: 1, fontWeight: 'bold' }}
              >
                Send Now
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes scanEffect {
          0% { top: 0%; }
          50% { top: 100%; }
          100% { top: 0%; }
        }
        @keyframes sosPulseBg {
          0% { box-shadow: 0 0 15px rgba(239, 68, 68, 0.4); }
          100% { box-shadow: 0 0 35px rgba(239, 68, 68, 0.85); }
        }
        @keyframes pulse-bus {
          0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(234, 179, 8, 0.7); }
          70% { transform: scale(1.1); box-shadow: 0 0 0 10px rgba(234, 179, 8, 0); }
          100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(234, 179, 8, 0); }
        }
      `}</style>
    </div>
  );
}
