import { useContext, useState, useEffect, useRef } from 'react';
import { AppContext, API_BASE } from '../context/AppContext';
import { Shield, Map, Clock, Bell, User, TrendingUp, Calendar, Bot, MessageSquare, Send, X } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './ParentDashboard.css';
import { parseAddress, getCleanAddressName, geocodeAddress } from '../utils/geoUtils';

export default function ParentDashboard() {
  const { currentUser, students, attendance, routes, buses, trips, notifications, leaveRequests, submitLeaveRequest, cancelLeaveRequest, drivers, grievances, driverRatings, submitGrievance, submitDriverRating, studentRequests, submitStudentRequest } = useContext(AppContext);
  const [mapView, setMapView] = useState('satellite');
  const [activeTab, setActiveTab] = useState('tracking');
  const [rightColTab, setRightColTab] = useState('alerts');
  const mapInstances = useRef({});
  const lastMapState = useRef({});
  const [resolvedCoords, setResolvedCoords] = useState({});
  const [delayPrediction, setDelayPrediction] = useState(null);

  // Grievance Portal form states
  const [grievanceTitle, setGrievanceTitle] = useState('');
  const [grievanceCategory, setGrievanceCategory] = useState('Delay');
  const [grievanceDescription, setGrievanceDescription] = useState('');

  // Rating states
  const [ratingStars, setRatingStars] = useState(5);
  const [ratingComments, setRatingComments] = useState('');
  const [dismissedRatings, setDismissedRatings] = useState([]);


  // Resolve coordinates: check cache/state first, fallback to parsed (which has deterministic hash)
  const getStopCoordinate = (stopName) => {
    const clean = getCleanAddressName(stopName);
    if (resolvedCoords[clean]) return resolvedCoords[clean];
    return parseAddress(stopName).coords;
  };

  // Async geocoding of linked children's home addresses and route stops
  useEffect(() => {
    const parentId = currentUser.parentId || 'P1';
    const linked = students.filter(s => s.parentId === parentId);
    if (linked.length === 0) return;

    const fetchAllCoords = async () => {
      let updated = false;
      const newCoords = { ...resolvedCoords };

      for (const student of linked) {
        if (student.address) {
          const cleanHome = getCleanAddressName(student.address);
          if (!newCoords[cleanHome]) {
            newCoords[cleanHome] = parseAddress(student.address).coords;
            updated = true;
          }
          // Fetch Nominatim async only if there are no embedded coordinates in the address string
          if (!student.address.includes('@')) {
            const fetched = await geocodeAddress(student.address);
            if (fetched && (!newCoords[cleanHome] || newCoords[cleanHome][0] !== fetched[0] || newCoords[cleanHome][1] !== fetched[1])) {
              newCoords[cleanHome] = fetched;
              updated = true;
            }
          }
        }

        const route = routes.find(r => r.routeId === student.routeId);
        if (route) {
          for (const stop of route.stops) {
            const cleanStop = getCleanAddressName(stop);
            if (!newCoords[cleanStop]) {
              newCoords[cleanStop] = parseAddress(stop).coords;
              updated = true;
            }
            // Fetch Nominatim async only if there are no embedded coordinates in the stop string
            if (!stop.includes('@')) {
              const fetched = await geocodeAddress(stop);
              if (fetched && (!newCoords[cleanStop] || newCoords[cleanStop][0] !== fetched[0] || newCoords[cleanStop][1] !== fetched[1])) {
                newCoords[cleanStop] = fetched;
                updated = true;
              }
            }
          }
        }
      }

      if (updated) {
        setResolvedCoords(newCoords);
      }
    };

    fetchAllCoords();
  }, [students, routes, currentUser.parentId]);

  const [leaveStudentId, setLeaveStudentId] = useState('');
  const [leaveDate, setLeaveDate] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveTripType, setLeaveTripType] = useState('Both');

  const handleLeaveSubmit = async (e) => {
    e.preventDefault();
    if (!leaveStudentId || !leaveDate || !leaveReason) return;
    const res = await submitLeaveRequest(Number(leaveStudentId), leaveDate, leaveReason, leaveTripType);
    if (res.success) {
      setLeaveStudentId('');
      setLeaveDate('');
      setLeaveReason('');
      setLeaveTripType('Both');
      alert('Leave request registered successfully!');
    } else {
      alert(res.message);
    }
  };

  const [enrollName, setEnrollName] = useState('');
  const [enrollClass, setEnrollClass] = useState('');
  const [enrollSection, setEnrollSection] = useState('');
  const [enrollAddress, setEnrollAddress] = useState('');
  const [enrollPhone, setEnrollPhone] = useState('');
  const [enrollEmail, setEnrollEmail] = useState('');
  const [enrollRouteId, setEnrollRouteId] = useState('');
  const [enrollBusId, setEnrollBusId] = useState('');
  const [enrollError, setEnrollError] = useState('');
  const [enrollSuccess, setEnrollSuccess] = useState('');

  const handleEnrollSubmit = async (e) => {
    e.preventDefault();
    setEnrollError('');
    setEnrollSuccess('');

    if (!enrollName || !enrollClass || !enrollSection || !enrollAddress) {
      setEnrollError('Please fill in all required fields (Name, Class, Section, Address).');
      return;
    }

    const requestData = {
      name: enrollName,
      class: enrollClass,
      section: enrollSection,
      address: enrollAddress,
      phone: enrollPhone || currentUser.phone || '',
      email: enrollEmail || currentUser.email || '',
      parentId: Number(parentId),
      routeId: enrollRouteId ? Number(enrollRouteId) : null,
      busId: enrollBusId ? Number(enrollBusId) : null,
      status: 'PENDING'
    };

    const res = await submitStudentRequest(requestData);
    if (res.success) {
      setEnrollSuccess('Student enrollment request submitted successfully!');
      setEnrollName('');
      setEnrollClass('');
      setEnrollSection('');
      setEnrollAddress('');
      setEnrollPhone('');
      setEnrollEmail('');
      setEnrollRouteId('');
      setEnrollBusId('');
    } else {
      setEnrollError(res.message || 'Failed to submit enrollment request.');
    }
  };

  // Parent profile resolution
  const parentId = currentUser.parentId || 'P1';
  
  // Find linked children
  const linkedStudents = students.filter(s => s.parentId === parentId);

  // Chatbot Logic
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    {
      id: 1,
      sender: 'bot',
      text: `Hello ${currentUser.name}! I am your Smart School Bus Assist Bot. How can I help you query your children's bus arrival times, current position, or driver contact info today?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef(null);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isChatOpen]);

  const generateBotResponse = (query) => {
    const q = query.toLowerCase().trim();
    
    if (linkedStudents.length === 0) {
      return "I couldn't find any students linked to your account. Please contact the administrator.";
    }

    // Identify which child is queried (or default to the first one)
    let targetStudent = linkedStudents[0];
    let childSpecified = false;
    for (const student of linkedStudents) {
      if (q.includes(student.name.toLowerCase())) {
        targetStudent = student;
        childSpecified = true;
        break;
      }
    }

    const studentName = targetStudent.name;
    const bus = buses.find(b => String(b.busId) === String(targetStudent.busId));
    const route = routes.find(r => String(r.routeId) === String(targetStudent.routeId));
    const activeTrip = trips.find(t => (String(t.routeId) === String(targetStudent.routeId) || String(t.busId) === String(targetStudent.busId)) && t.status !== 'Completed');
    const driver = bus ? drivers.find(d => String(d.driverId) === String(bus.driverId)) : null;

    // Greeting intent
    if (q.includes('hello') || q.includes('hi') || q.includes('hey') || q.includes('greet')) {
      return `Hello! How can I help you today? You can ask about bus arrival times, current position, driver details, or deviation status.`;
    }

    // INTENT: DRIVER DETAILS
    if (q.includes('driver') || q.includes('phone') || q.includes('contact') || q.includes('call')) {
      if (!driver) {
        return `I couldn't find any driver details assigned to ${studentName}'s bus (${bus ? bus.busNumber : 'No Bus'}).`;
      }
      return `The driver for ${studentName}'s bus (${bus.busNumber}) is **${driver.name}**. You can contact them at **${driver.phone}**.`;
    }

    // INTENT: CURRENT POSITION / WHERE IS THE BUS / TRACKING
    if (q.includes('where') || q.includes('position') || q.includes('location') || q.includes('status') || q.includes('tracking') || q.includes('map')) {
      if (!bus) {
        return `No bus is currently assigned to ${studentName}.`;
      }
      if (!activeTrip) {
        return `Bus ${bus.busNumber} for ${studentName} is not currently running an active trip. It is staged at the school depot.`;
      }
      
      const currentStop = route && route.stops[activeTrip.currentStopIndex] ? route.stops[activeTrip.currentStopIndex] : 'Depot';
      let deviationAlert = activeTrip.routeDeviated ? " ⚠️ ALERT: The bus is currently DEVIATING off the geofenced route!" : "";
      
      if (activeTrip.status === 'Emergency') {
        return `🚨 EMERGENCY STATUS: Bus ${bus.busNumber} has triggered an SOS alert. Incident management is active. Last logged area: ${currentStop}.`;
      }
      
      return `Bus ${bus.busNumber} is currently at stop "${currentStop}" (${activeTrip.currentStopIndex + 1} of ${route ? route.stops.length : 0} stops completed).${deviationAlert} Distance covered so far: ${activeTrip.distanceCovered}.`;
    }

    // INTENT: ARRIVAL TIME / ETA / WHEN WILL IT ARRIVE
    if (q.includes('arrive') || q.includes('arrival') || q.includes('time') || q.includes('eta') || q.includes('when')) {
      if (!activeTrip) {
        return `Bus ${bus ? bus.busNumber : 'N/A'} is not currently on an active route. Live arrival estimates are unavailable.`;
      }
      if (!route) {
        return `I couldn't locate route details for ${studentName}'s bus.`;
      }

      const cleanHome = getCleanAddressName(targetStudent.address);
      const childStopIdx = route.stops.findIndex(stop => getCleanAddressName(stop) === cleanHome);
      if (childStopIdx === -1) {
        return `${studentName}'s stop "${cleanHome}" is not on route "${route.routeName}".`;
      }

      const currentStopIdx = activeTrip.currentStopIndex;

      if (currentStopIdx > childStopIdx) {
        return `The bus has already passed ${studentName}'s stop ("${cleanHome}"). It is currently at stop "${getCleanAddressName(route.stops[currentStopIdx])}".`;
      }
      
      if (currentStopIdx === childStopIdx) {
        return `The bus is currently AT ${studentName}'s stop ("${cleanHome}"). Please ensure they are ready to board!`;
      }

      // Calculate ETA
      let durationMinutes = 30;
      if (route.estimatedTime) {
        const parsed = parseInt(route.estimatedTime.replace(/[^0-9]/g, ''));
        if (!isNaN(parsed)) durationMinutes = parsed;
      }
      const durationPerLeg = durationMinutes / (route.stops.length - 1);
      const remainingLegs = childStopIdx - currentStopIdx;
      const etaMinutes = Math.round(remainingLegs * durationPerLeg);
      
      const referenceTimeMs = new Date(activeTrip.startTime).getTime();
      const etaTime = new Date(referenceTimeMs + childStopIdx * durationPerLeg * 60 * 1000);
      const etaTimeString = etaTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      return `Estimated arrival at ${studentName}'s stop ("${cleanHome}") is in approx. **${etaMinutes} minutes** (at around **${etaTimeString}**). The bus is currently ${remainingLegs} stroke away.`.replace('stroke away', 'stops away');
    }

    // INTENT: DEVIATION / ALERT
    if (q.includes('deviat') || q.includes('off') || q.includes('wrong') || q.includes('alert') || q.includes('geofence')) {
      if (!activeTrip) {
        return `There is no active route running right now. No deviation alerts are active.`;
      }
      if (activeTrip.routeDeviated) {
        return `⚠️ Yes, a Route Deviation is active for Bus ${bus ? bus.busNumber : 'N/A'}. The bus has drifted off the scheduled route path. Admins are investigating.`;
      } else {
        return `Bus ${bus ? bus.busNumber : 'N/A'} is currently on-route and following the geofenced path normally.`;
      }
    }

    // Fallback help response
    let multiChildNote = linkedStudents.length > 1 ? ` Since you have multiple children registered (${linkedStudents.map(s => s.name).join(', ')}), you can specify their name in your question (e.g., "Where is ${linkedStudents[1].name}'s bus?").` : "";
    
    return `I'm not sure how to answer that. You can ask queries like:
- "Where is my child's bus?" or "Current position"
- "When will the bus arrive at stop?" or "Estimate arrival time"
- "Get driver contact details"
- "Is the bus deviating from its route?"
${multiChildNote}`;
  };

  const handleSendChat = (textToSend) => {
    const messageText = textToSend || chatInput;
    if (!messageText.trim()) return;

    const userMsg = {
      id: Date.now(),
      sender: 'user',
      text: messageText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setChatMessages(prev => [...prev, userMsg]);
    if (!textToSend) setChatInput('');

    setTimeout(() => {
      const responseText = generateBotResponse(messageText);
      const botMsg = {
        id: Date.now() + 1,
        sender: 'bot',
        text: responseText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setChatMessages(prev => [...prev, botMsg]);
    }, 600);
  };

  // Filter attendance records of linked students
  const studentIds = linkedStudents.map(s => s.studentId);
  const studentAttendance = attendance.filter(a => studentIds.includes(a.studentId));

  // Find if there is any active trip for the children's routes
  const activeTripsList = trips.filter(t => t.status === 'Active' || t.status === 'Emergency');

  // Selected student for single-view dashboard focus
  const [selectedStudentId, setSelectedStudentId] = useState(() => {
    return linkedStudents.length > 0 ? linkedStudents[0].studentId : null;
  });

  // Poll for delay predictions of the active student trip
  useEffect(() => {
    const student = students.find(s => s.studentId === selectedStudentId);
    if (!student) return;
    const activeTrip = trips.find(t => 
      (String(t.routeId) === String(student.routeId) || String(t.busId) === String(student.busId)) && 
      (t.status === 'Active' || t.status === 'Emergency')
    );
    if (!activeTrip) {
      setDelayPrediction(null);
      return;
    }

    const fetchPrediction = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/gps/trip/${activeTrip.tripId}/prediction`);
        if (res.ok) {
          setDelayPrediction(await res.json());
        }
      } catch (e) {}
    };

    fetchPrediction();
    const interval = setInterval(fetchPrediction, 4000);
    return () => clearInterval(interval);
  }, [selectedStudentId, trips]);

  const [attendanceTab, setAttendanceTab] = useState('weekly');
  const [selectedMonth, setSelectedMonth] = useState(5); // June (Default since seed data is June 2026)
  const [selectedYear, setSelectedYear] = useState(2026);

  // Sync leave student dropdown to selected child
  useEffect(() => {
    if (selectedStudentId) {
      setLeaveStudentId(selectedStudentId.toString());
    }
  }, [selectedStudentId]);

  // Automatically select the first child when they are loaded and none is selected
  useEffect(() => {
    if (linkedStudents.length > 0 && !selectedStudentId) {
      setSelectedStudentId(linkedStudents[0].studentId);
    }
  }, [linkedStudents, selectedStudentId]);

  
  // Filter notifications relevant to this parent user
  const parentNotifications = notifications.filter(n => n.userId === currentUser.userId);

  const [roadPaths, setRoadPaths] = useState({});
  const osrmCache = useRef({});

  const getRoadPath = async (key, waypointCoords) => {
    if (osrmCache.current[key]) return osrmCache.current[key];
    if (waypointCoords.length < 2) return waypointCoords;

    try {
      const waypointStr = waypointCoords.map(c => `${c[1]},${c[0]}`).join(';');
      const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${waypointStr}?overview=full&geometries=geojson`);
      if (response.ok) {
        const data = await response.json();
        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
          const path = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
          osrmCache.current[key] = path;
          return path;
        }
      }
    } catch (e) {
      console.warn("OSRM routing failed for key: " + key, e);
    }
    osrmCache.current[key] = waypointCoords;
    return waypointCoords;
  };

  useEffect(() => {
    if (!selectedStudentId) return;
    const student = linkedStudents.find(s => s.studentId === selectedStudentId);
    if (!student) return;
    const route = routes.find(r => r.routeId === student.routeId);
    if (!route) return;

    const activeTrip = activeTripsList.find(t => String(t.routeId) === String(student.routeId) || String(t.busId) === String(student.busId));
    const coords = route.stops.map(stop => getStopCoordinate(stop));

    const loadRoads = async () => {
      const pathsToLoad = {};
      if (activeTrip) {
        const passedKey = `passed-${route.routeId}-${activeTrip.currentStopIndex}`;
        const passedCoords = coords.slice(0, activeTrip.currentStopIndex + 1);
        pathsToLoad[passedKey] = passedCoords;

        const remainingKey = `remaining-${route.routeId}-${activeTrip.currentStopIndex}`;
        const remainingCoords = coords.slice(activeTrip.currentStopIndex);
        pathsToLoad[remainingKey] = remainingCoords;
      } else {
        const fullKey = `full-${route.routeId}`;
        pathsToLoad[fullKey] = coords;
      }

      let updated = false;
      const newPaths = { ...roadPaths };
      for (const [key, wps] of Object.entries(pathsToLoad)) {
        if (!newPaths[key]) {
          const path = await getRoadPath(key, wps);
          newPaths[key] = path;
          updated = true;
        }
      }
      if (updated) {
        setRoadPaths(newPaths);
      }
    };

    loadRoads();
  }, [selectedStudentId, routes, trips, resolvedCoords]);

  // Map initialization and sync effect
  useEffect(() => {
    if (!selectedStudentId || activeTab !== 'tracking') return;

    // Clean up other map instances that are NOT the selected student's map
    Object.keys(mapInstances.current).forEach(id => {
      if (Number(id) !== selectedStudentId) {
        mapInstances.current[id].map.remove();
        delete mapInstances.current[id];
      }
    });

    const student = linkedStudents.find(s => s.studentId === selectedStudentId);
    if (!student) return;

    const containerId = `map-${student.studentId}`;
    const element = document.getElementById(containerId);
    if (!element) return;

    const route = routes.find(r => r.routeId === student.routeId);
    if (!route) return;

    const coords = route.stops.map(stop => getStopCoordinate(stop));
    const schoolCoord = getStopCoordinate("School");

    if (!mapInstances.current[student.studentId]) {
      const map = L.map(containerId, {
        zoomControl: true,
        scrollWheelZoom: false
      }).setView(schoolCoord, 13);

      mapInstances.current[student.studentId] = {
        map,
        markers: [],
        polylines: []
      };
    }

    const instanceObj = mapInstances.current[student.studentId];
    const { map } = instanceObj;

    // Clear existing layers
    if (instanceObj.streetLayer) map.removeLayer(instanceObj.streetLayer);
    if (instanceObj.satelliteLayer) map.removeLayer(instanceObj.satelliteLayer);
    instanceObj.markers.forEach(m => map.removeLayer(m));
    instanceObj.polylines.forEach(p => map.removeLayer(p));
    instanceObj.markers = [];
    instanceObj.polylines = [];

    // Add Tile Layer based on view
    if (mapView === 'satellite') {
      instanceObj.satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri'
      }).addTo(map);
    } else {
      instanceObj.streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
      }).addTo(map);
    }

    const activeTrip = activeTripsList.find(t => String(t.routeId) === String(student.routeId) || String(t.busId) === String(student.busId));
    const isTripActive = !!activeTrip;
    const currentStopIdx = activeTrip ? activeTrip.currentStopIndex : -1;

    // Determine if we should snap the map viewport (initial load, route changed, trip status changed, or bus moved stop)
    const prevMapState = lastMapState.current[student.studentId];
    const shouldAdjustView = !prevMapState ||
                             prevMapState.routeId !== student.routeId ||
                             prevMapState.isTripActive !== isTripActive ||
                             prevMapState.currentStopIdx !== currentStopIdx ||
                             prevMapState.mapView !== mapView;

    // Cache current state for the next update
    lastMapState.current[student.studentId] = {
      routeId: student.routeId,
      isTripActive,
      currentStopIdx,
      mapView
    };

    // Draw path lines using OSRM road coordinates when available, else fallback to straight lines
    const passedLineCoords = activeTrip
      ? (roadPaths[`passed-${route.routeId}-${activeTrip.currentStopIndex}`] || coords.slice(0, activeTrip.currentStopIndex + 1))
      : [];
    const remainingLineCoords = activeTrip
      ? (roadPaths[`remaining-${route.routeId}-${activeTrip.currentStopIndex}`] || coords.slice(activeTrip.currentStopIndex))
      : (roadPaths[`full-${route.routeId}`] || coords);

    if (passedLineCoords.length > 1) {
      const passedLine = L.polyline(passedLineCoords, {
        color: '#22c55e',
        weight: 5,
        opacity: 0.9,
        dashArray: '2, 5'
      }).addTo(map);
      instanceObj.polylines.push(passedLine);
    }

    if (remainingLineCoords.length > 1) {
      const remainingLine = L.polyline(remainingLineCoords, {
        color: mapView === 'satellite' ? '#cbd5e1' : '#475569',
        weight: 4,
        opacity: 0.8
      }).addTo(map);
      instanceObj.polylines.push(remainingLine);
    }

    // Draw stops
    route.stops.forEach((stop, idx) => {
      const coord = getStopCoordinate(stop);
      const isCurrent = activeTrip ? idx === activeTrip.currentStopIndex : false;
      const isPassed = activeTrip ? idx < activeTrip.currentStopIndex : false;

      const stopMarker = L.circleMarker(coord, {
        radius: isCurrent ? 8 : 6,
        fillColor: isCurrent ? '#3b82f6' : isPassed ? '#22c55e' : '#94a3b8',
        color: '#ffffff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.9
      }).addTo(map);

      let etaText = "";
      if (activeTrip && activeTrip.status !== 'Completed' && idx > activeTrip.currentStopIndex) {
        let durationMinutes = 30;
        if (route.estimatedTime) {
          const parsed = parseInt(route.estimatedTime.replace(/[^0-9]/g, ''));
          if (!isNaN(parsed)) durationMinutes = parsed;
        }
        const durationPerLeg = durationMinutes / (route.stops.length - 1);
        const referenceTimeMs = new Date(activeTrip.startTime).getTime();
        const etaTime = new Date(referenceTimeMs + idx * durationPerLeg * 60 * 1000);
        etaText = ` (ETA: ${etaTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
      }

      const cleanStop = getCleanAddressName(stop);
      const cleanHome = getCleanAddressName(student.address);
      const isHome = cleanStop === cleanHome;

      stopMarker.bindTooltip(isHome ? `📍 ${cleanStop} (Home)${etaText}` : `${cleanStop}${etaText}`, {
        permanent: true,
        direction: 'top',
        className: `map-stop-tooltip ${mapView}`
      });

      instanceObj.markers.push(stopMarker);
    });

    // Draw student's home marker separately if it is NOT on the route stops list
    const cleanHome = getCleanAddressName(student.address);
    const hasHomeStop = route.stops.some(stop => getCleanAddressName(stop) === cleanHome);

    if (!hasHomeStop && student.address) {
      const homeCoord = getStopCoordinate(student.address);
      const homeIcon = L.divIcon({
        html: `<div style="font-size: 20px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">🏡</div>`,
        className: 'custom-home-icon-leaflet',
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      });
      const homeMarker = L.marker(homeCoord, { icon: homeIcon }).addTo(map);
      homeMarker.bindTooltip(`🏡 ${student.name}'s Home: ${cleanHome}`, {
        permanent: true,
        direction: 'top',
        className: `map-stop-tooltip ${mapView} home-tooltip`
      });
      instanceObj.markers.push(homeMarker);
    }

    // Draw active bus
    if (activeTrip) {
      const currentStopCoord = coords[activeTrip.currentStopIndex] || schoolCoord;
      const busIcon = L.divIcon({
        html: `<div class="map-bus-icon-leaflet">🚌</div>`,
        className: 'leaflet-bus-icon-container',
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });
      const busMarker = L.marker(currentStopCoord, { icon: busIcon }).addTo(map);
      instanceObj.markers.push(busMarker);
      if (shouldAdjustView) {
        map.panTo(currentStopCoord);
      }
    } else {
      if (coords.length > 0 && shouldAdjustView) {
        map.fitBounds(L.latLngBounds(coords), { padding: [30, 30] });
      }
    }

    return () => {
      const instance = mapInstances.current[student.studentId];
      if (instance && instance.map) {
        try {
          instance.map.remove();
        } catch (e) {
          console.warn("Error removing map instance for student " + student.studentId, e);
        }
        delete mapInstances.current[student.studentId];
      }
    };
  }, [selectedStudentId, routes, buses, trips, mapView, resolvedCoords, roadPaths, activeTab]);

  // Clean up maps on unmount
  useEffect(() => {
    return () => {
      Object.keys(mapInstances.current).forEach(id => {
        mapInstances.current[id].map.remove();
      });
      mapInstances.current = {};
    };
  }, []);

  return (
    <div className="dashboard-content">
      {/* Emergency SOS Banner */}
      {(() => {
        const emergencyTrips = activeTripsList.filter(t => t.status === 'Emergency');
        const emergencyStudentBuses = linkedStudents.filter(s => emergencyTrips.some(t => String(t.routeId) === String(s.routeId) || String(t.busId) === String(s.busId)));
        if (emergencyStudentBuses.length > 0) {
          return emergencyStudentBuses.map(student => {
            const trip = emergencyTrips.find(t => String(t.routeId) === String(student.routeId) || String(t.busId) === String(student.busId));
            const bus = buses.find(b => String(b.busId) === String(trip?.busId || student.busId));
            const route = routes.find(r => String(r.routeId) === String(student.routeId));
            const message = trip?.logs[trip.logs.length - 1] || "Unspecified issue";
            return (
              <div key={student.studentId} className="alert alert-danger emergency-flash-banner" style={{ border: '2px solid #ef4444', backgroundColor: 'rgba(239, 68, 68, 0.08)', color: '#b91c1c', display: 'flex', flexDirection: 'column', gap: '0.4rem', padding: '1.25rem', borderRadius: '10px', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '900', fontSize: '1.1rem', letterSpacing: '-0.01em' }}>
                  <span>🚨</span> EMERGENCY DISPATCH NOTIFIED & LIVE MONITORING
                </div>
                <div style={{ fontSize: '0.88rem', fontWeight: '700' }}>
                  Bus <strong>{bus ? bus.busNumber : 'Unknown'}</strong> ({route ? route.routeName : 'Unknown'}) has reported an incident:
                </div>
                <div style={{ fontSize: '0.85rem', padding: '0.6rem 0.85rem', backgroundColor: 'rgba(255, 255, 255, 0.65)', borderRadius: '6px', fontStyle: 'italic', color: '#7f1d1d', fontWeight: '600' }}>
                  Status: "{message.replace("[EMERGENCY] SOS Triggered: ", "")}"
                </div>
                <div style={{ fontSize: '0.82rem', marginTop: '0.25rem', color: '#b91c1c', fontWeight: '700', lineHeight: '1.4' }}>
                  💡 Reassurance Alert: Replacement Shuttle <strong>#BUS-99</strong> is in route. Safety team response is on-site. Your child is secure.
                </div>
              </div>
            );
          });
        }
        return null;
      })()}

      {/* Route Deviation Warning Banner */}
      {(() => {
        const deviatedTrips = activeTripsList.filter(t => t.routeDeviated);
        const deviatedStudentBuses = linkedStudents.filter(s => deviatedTrips.some(t => String(t.routeId) === String(s.routeId) || String(t.busId) === String(s.busId)));
        if (deviatedStudentBuses.length > 0) {
          return deviatedStudentBuses.map(student => {
            const trip = deviatedTrips.find(t => String(t.routeId) === String(student.routeId) || String(t.busId) === String(student.busId));
            const bus = buses.find(b => String(b.busId) === String(trip?.busId || student.busId));
            const route = routes.find(r => String(r.routeId) === String(student.routeId));
            const message = trip ? [...trip.logs].reverse().find(log => log.includes("[DEVIATION]")) || "Simulated GPS drift - 500m off-route" : "Simulated GPS drift - 500m off-route";
            return (
              <div key={student.studentId} className="alert alert-warning route-deviation-banner" style={{ border: '2px solid #d97706', backgroundColor: '#fffbeb', color: '#b45309', display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '1.5rem', padding: '1rem', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold', fontSize: '1.05rem' }}>
                  <span>⚠️</span> ROUTE DEVIATION DETECTED FOR {student.name.toUpperCase()}'S TRANSIT
                </div>
                <div style={{ fontSize: '0.85rem', fontWeight: '600' }}>
                  Bus <strong>{bus ? bus.busNumber : 'Unknown'}</strong> on <strong>{route ? route.routeName : 'Unknown'}</strong> has drifted off its scheduled geofence boundary.
                </div>
                <div style={{ fontSize: '0.85rem', padding: '0.5rem', backgroundColor: 'rgba(255, 255, 255, 0.6)', borderRadius: '4px', fontStyle: 'italic', color: '#78350f', marginTop: '0.25rem' }}>
                  Deviation details: "{message.replace("[DEVIATION] Route Deviation Triggered: ", "")}"
                </div>
                <div style={{ fontSize: '0.75rem', marginTop: '0.25rem', fontWeight: 'bold' }}>
                  School administrators have been alerted and are investigating the route change.
                </div>
              </div>
            );
          });
        }
        return null;
      })()}

      <div className="dashboard-title-bar">
        <div>
          <h2>Parent Portal</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
            Family Transportation Center | Guardian: <strong>{currentUser.name}</strong>
          </p>
        </div>
      </div>

        <>
          <div className="tabs-header" role="tablist" aria-label="Parent Portal Sections">
            <button 
              className={`tab-btn ${activeTab === 'tracking' ? 'active' : ''}`}
              onClick={() => setActiveTab('tracking')}
              role="tab"
              aria-selected={activeTab === 'tracking'}
            >
              🗺️ Live Tracking
            </button>
            <button 
              className={`tab-btn ${activeTab === 'leave' ? 'active' : ''}`}
              onClick={() => setActiveTab('leave')}
              role="tab"
              aria-selected={activeTab === 'leave'}
            >
              📅 Absence Planner
            </button>
            <button 
              className={`tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
              onClick={() => setActiveTab('analytics')}
              role="tab"
              aria-selected={activeTab === 'analytics'}
            >
              📊 Attendance Insights
            </button>
            <button 
              className={`tab-btn ${activeTab === 'grievances' ? 'active' : ''}`}
              onClick={() => setActiveTab('grievances')}
              role="tab"
              aria-selected={activeTab === 'grievances'}
            >
              ⚠️ Grievances
            </button>
            <button 
              className={`tab-btn ${activeTab === 'enrollment' ? 'active' : ''}`}
              onClick={() => setActiveTab('enrollment')}
              role="tab"
              aria-selected={activeTab === 'enrollment'}
            >
              🏫 Student Enrollment
            </button>
          </div>

          {activeTab === 'tracking' && (
            linkedStudents.length === 0 ? (
              <div className="card-panel" style={{ textAlign: 'center', padding: '3rem', margin: '0 auto', maxWidth: '600px' }}>
                <Shield size={48} color="var(--warning)" style={{ marginBottom: '1rem' }} />
                <h3>No Student Linked</h3>
                <p>Please submit a request in the <strong>Student Enrollment</strong> tab or contact the administrator to link your child.</p>
              </div>
            ) : (
              <div className="dashboard-grid">
              {/* Left Column: Compact Children list & Active Bus Tracking Map */}
              <div>
                {/* Compact Linked Students Selector */}
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }} role="group" aria-label="Linked students selection grid">
                  {linkedStudents.map(student => {
                    const isSelected = student.studentId === selectedStudentId;
                    return (
                      <button
                        key={student.studentId}
                        onClick={() => setSelectedStudentId(student.studentId)}
                        className={`btn ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ 
                          padding: '0.45rem 1rem', 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '0.5rem',
                          borderRadius: '20px',
                          border: isSelected ? '1px solid var(--primary-color)' : '1px solid var(--border-color)',
                          boxShadow: isSelected ? '0 0 10px rgba(249, 115, 22, 0.15)' : 'none',
                          fontSize: '0.85rem'
                        }}
                        aria-pressed={isSelected}
                      >
                        <User size={14} />
                        <span>{student.name} (Grade {student.class}-{student.section})</span>
                      </button>
                    );
                  })}
                </div>

                {/* Compact Student Route Metadata Summary & Live Map */}
                {selectedStudentId ? (
                  <>
                    {/* Driver Rating Card Prompt */}
                    {(() => {
                      const student = linkedStudents.find(s => s.studentId === selectedStudentId);
                      if (!student) return null;
                      const bus = buses.find(b => b.busId === student.busId);
                      if (!bus) return null;
                      const driver = drivers.find(d => d.driverId === bus.driverId);
                      if (!driver) return null;

                      // Find completed trips for this bus that are not rated by this parent yet
                      const completedBusTrips = trips.filter(t => t.busId === bus.busId && t.status === 'Completed');
                      const unratedTrips = completedBusTrips.filter(t => {
                        const alreadyRated = driverRatings.some(r => r.tripId === t.tripId && r.parentId === (currentUser.parentId || 1));
                        const isDismissed = dismissedRatings.includes(t.tripId);
                        return !alreadyRated && !isDismissed;
                      });

                      if (unratedTrips.length === 0) return null;
                      const latestTrip = unratedTrips[unratedTrips.length - 1];

                      return (
                        <div className="card-panel" style={{ border: '2px solid var(--primary-color)', backgroundColor: 'var(--panel-bg)', padding: '1.25rem', borderRadius: '12px', marginBottom: '1.25rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <h4 style={{ fontSize: '1rem', margin: 0, fontWeight: '800', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              ⭐ Rate Your Last Ride
                            </h4>
                            <button 
                              onClick={() => setDismissedRatings(prev => [...prev, latestTrip.tripId])} 
                              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}
                            >
                              Skip
                            </button>
                          </div>
                          <p style={{ fontSize: '0.82rem', margin: '0 0 0.75rem 0', color: 'var(--text-muted)' }}>
                            Bus <strong>{bus.busNumber}</strong> trip ended. How would you rate driver <strong>{driver.name}</strong>'s performance on this route?
                          </p>
                          
                          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.75rem' }}>
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                onClick={() => setRatingStars(star)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  fontSize: '1.4rem',
                                  color: star <= ratingStars ? '#eab308' : '#e5e7eb',
                                  padding: 0
                                }}
                              >
                                ★
                              </button>
                            ))}
                          </div>

                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <input
                              type="text"
                              placeholder="Write a comment (optional)..."
                              value={ratingComments}
                              onChange={(e) => setRatingComments(e.target.value)}
                              style={{
                                flex: 1,
                                padding: '0.45rem 0.75rem',
                                borderRadius: '6px',
                                border: '1px solid var(--border-color)',
                                backgroundColor: 'var(--bg-color)',
                                color: 'var(--text-main)',
                                fontSize: '0.8rem',
                                outline: 'none'
                              }}
                            />
                            <button
                              onClick={async () => {
                                const res = await submitDriverRating(currentUser.parentId || 1, driver.driverId, latestTrip.tripId, ratingStars, ratingComments);
                                if (res.success) {
                                  alert('Thank you for your feedback!');
                                  setRatingComments('');
                                } else {
                                  alert(res.message);
                                }
                              }}
                              className="btn btn-primary btn-sm"
                            >
                              Submit
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Compact Student Route Metadata Summary */}
                    {(() => {
                      const student = linkedStudents.find(s => s.studentId === selectedStudentId);
                      if (!student) return null;
                      const route = routes.find(r => r.routeId === student.routeId);
                      const bus = buses.find(b => b.busId === student.busId);
                      const latestRecord = studentAttendance.filter(a => a.studentId === student.studentId).sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time))[0];
                      const driver = bus ? drivers.find(d => d.driverId === bus.driverId) : null;
                      return (
                        <>
                          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', padding: '0.75rem 1rem', backgroundColor: 'var(--panel-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem' }}>
                            <div>📍 <strong>Pickup Stop:</strong> {getCleanAddressName(student.address)}</div>
                            <div>🚌 <strong>Bus Route:</strong> {route ? route.routeName : 'Not Assigned'} ({bus ? bus.busNumber : 'None'})</div>
                            {latestRecord && (
                              <div>📋 <strong>Last Status:</strong> <span className={`badge ${latestRecord.status.toLowerCase()}`} style={{ fontSize: '0.75rem', padding: '0.1rem 0.4rem' }}>{latestRecord.status}</span> <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>at {latestRecord.time}</span></div>
                            )}
                          </div>
                          
                          {driver && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', backgroundColor: 'var(--panel-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', marginBottom: '1.25rem' }}>
                              <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'var(--primary-color)', color: '#09090b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.1rem', flexShrink: 0 }}>
                                {driver.name.split(' ').map(n => n[0]).join('')}
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-main)' }}>Assigned Driver: {driver.name}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>License: {driver.licenseNumber} • Phone: {driver.phone}</div>
                              </div>
                              <a href={`tel:${driver.phone}`} style={{ textDecoration: 'none' }} className="btn btn-primary btn-sm">
                                📞 Call Driver
                              </a>
                            </div>
                          )}
                        </>
                      );
                    })()}

                    {/* Live Bus Tracking Map Module */}
                    <section className="card-panel" aria-label="Live Bus Route Tracking Map Panel">
                      <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <span><Map size={18} style={{ verticalAlign: 'middle', marginRight: '4px' }} aria-hidden="true" /> Live Bus Route Tracking</span>
                        <div className="map-view-toggle" role="group" aria-label="Toggle map visual layer">
                          <button 
                            className={`btn btn-sm ${mapView === 'street' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setMapView('street')}
                            style={{ marginRight: '0.25rem' }}
                            aria-label="Switch map view to Street Layout"
                            aria-pressed={mapView === 'street'}
                          >
                            Street Map
                          </button>
                          <button 
                            className={`btn btn-sm ${mapView === 'satellite' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setMapView('satellite')}
                            aria-label="Switch map view to Satellite Layout"
                            aria-pressed={mapView === 'satellite'}
                          >
                            Satellite Map
                          </button>
                        </div>
                      </div>
                      
                      {(() => {
                        const student = linkedStudents.find(s => s.studentId === selectedStudentId);
                        if (!student) return null;

                        const route = routes.find(r => r.routeId === student.routeId);
                        const bus = buses.find(b => b.busId === student.busId);
                        const activeTrip = activeTripsList.find(t => t.busId === student.busId);
                        
                        if (!route) {
                          return (
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', padding: '1.5rem 0', textAlign: 'center' }} role="status">
                              No route configured for {student.name}.
                            </div>
                          );
                        }

                        return (
                          <div style={{ marginTop: '1rem' }}>
                            {/* Dynamic ETA Countdown Card */}
                            {activeTrip && (() => {
                              const homeStopIndex = route.stops.findIndex(stop => getCleanAddressName(stop) === getCleanAddressName(student.address));
                              if (homeStopIndex === -1) return null;
                              
                              if (activeTrip.currentStopIndex > homeStopIndex) {
                                return (
                                  <div style={{ padding: '0.85rem 1rem', borderRadius: '8px', backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', marginBottom: '1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                    ✅ Bus has passed your pickup stop.
                                  </div>
                                );
                              }
                              
                              if (activeTrip.currentStopIndex === homeStopIndex) {
                                return (
                                  <div style={{ padding: '0.85rem 1rem', borderRadius: '8px', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#10b981', marginBottom: '1rem', fontSize: '0.88rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', animation: 'pulse 1.5s infinite' }}>
                                    🚌 BUS IS AT YOUR STOP NOW! Please proceed to boarding.
                                  </div>
                                );
                              }

                              // Calculate exact stop sequence distance along coordinates
                              let distanceKm = 0;
                              const stopCoords = route.stops.map(s => getStopCoordinate(s));
                              for (let i = activeTrip.currentStopIndex; i < homeStopIndex; i++) {
                                if (stopCoords[i] && stopCoords[i+1]) {
                                  const lat1 = stopCoords[i][0], lon1 = stopCoords[i][1];
                                  const lat2 = stopCoords[i+1][0], lon2 = stopCoords[i+1][1];
                                  const R = 6371;
                                  const dLat = (lat2 - lat1) * Math.PI / 180;
                                  const dLon = (lon2 - lon1) * Math.PI / 180;
                                  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                                            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                                            Math.sin(dLon / 2) * Math.sin(dLon / 2);
                                  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                                  distanceKm += R * c;
                                }
                              }
                              
                              const delayMin = delayPrediction ? delayPrediction.estimatedMinutesDelay : 0;
                              const timeMinutes = Math.max(1, Math.round((distanceKm / 32) * 60) + delayMin);

                              return (
                                <div style={{ 
                                  padding: '1rem', 
                                  borderRadius: '8px', 
                                  backgroundColor: 'rgba(59, 130, 246, 0.08)', 
                                  border: '1px solid rgba(59, 130, 246, 0.25)', 
                                  marginBottom: '1rem',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center'
                                }}>
                                  <div>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                      Live Stop ETA Countdown
                                    </div>
                                    <div style={{ fontSize: '1.25rem', fontWeight: '900', color: 'var(--text-main)', marginTop: '2px' }}>
                                      Arriving in {timeMinutes} mins
                                    </div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                      Distance remaining: {distanceKm.toFixed(1)} km ({homeStopIndex - activeTrip.currentStopIndex} stops away)
                                    </div>
                                  </div>
                                  <div style={{ fontSize: '1.75rem' }}>⏱️</div>
                                </div>
                              );
                            })()}

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                              <strong>{student.name}'s Route: {route.routeName} ({bus ? bus.busNumber : 'No Bus'})</strong>
                              {activeTrip ? (
                                <span className="badge on-trip" style={{ animation: 'pulse 2s infinite' }} role="status" aria-live="polite">Bus In Transit</span>
                              ) : (
                                <span className="badge idle" role="status" aria-live="polite">Bus Idle</span>
                              )}
                            </div>

                            <div 
                              id={`map-${student.studentId}`}
                              className="leaflet-map-container"
                              role="region"
                              aria-label={`Interactive Leaflet Map representing Route: ${route.routeName}`}
                            />

                            {activeTrip && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}>
                                <div style={{ fontSize: '0.85rem', backgroundColor: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.2)', padding: '0.75rem', borderRadius: '6px' }}>
                                  🚌 <strong>Transit Update:</strong> Bus is passing <strong>{route.stops[activeTrip.currentStopIndex]}</strong> ({activeTrip.distanceCovered} covered).
                                </div>

                                {/* Delay Prediction Card */}
                                {delayPrediction ? (
                                  <div style={{
                                    padding: '0.75rem',
                                    borderRadius: '6px',
                                    backgroundColor: delayPrediction.status === 'On Time' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                                    border: `1px solid ${delayPrediction.status === 'On Time' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                  }}>
                                    <div>
                                      <span style={{ 
                                        fontWeight: 'bold', 
                                        color: delayPrediction.status === 'On Time' ? '#10b981' : '#ef4444',
                                        fontSize: '0.85rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                      }}>
                                        ⏰ {delayPrediction.status} ({delayPrediction.estimatedMinutesDelay}m delay)
                                      </span>
                                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                        Traffic: {delayPrediction.trafficCondition} | Weather: {delayPrediction.weatherCondition}
                                      </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>PREDICTED ETA</span>
                                      <div style={{ fontSize: '1.15rem', fontWeight: '800', color: 'var(--text-main)' }}>{delayPrediction.predictedEta}</div>
                                    </div>
                                  </div>
                                ) : (
                                  <div style={{
                                    padding: '0.65rem',
                                    borderRadius: '6px',
                                    backgroundColor: 'rgba(59, 130, 246, 0.08)',
                                    border: '1px solid rgba(59, 130, 246, 0.15)',
                                    fontSize: '0.8rem',
                                    color: '#3b82f6',
                                    textAlign: 'center'
                                  }}>
                                    ⏳ Calibrating real-time ETA & traffic forecasts...
                                  </div>
                                )}

                                {route.stops.slice(activeTrip.currentStopIndex + 1).length > 0 && (
                                  <div style={{ fontSize: '0.8rem', paddingLeft: '0.5rem' }}>
                                    <span style={{ fontWeight: '600', color: 'var(--text-muted)' }}>Upcoming Stops:</span>
                                    <ul style={{ margin: '0.25rem 0 0 0', paddingLeft: '1.25rem', listStyleType: 'circle' }}>
                                      {route.stops.slice(activeTrip.currentStopIndex + 1).map((stop, sIdx) => {
                                        const absIdx = activeTrip.currentStopIndex + 1 + sIdx;
                                        let durationMinutes = 30;
                                        if (route.estimatedTime) {
                                          const parsed = parseInt(route.estimatedTime.replace(/[^0-9]/g, ''));
                                          if (!isNaN(parsed)) durationMinutes = parsed;
                                        }
                                        const durationPerLeg = durationMinutes / (route.stops.length - 1);
                                        const referenceTimeMs = new Date(activeTrip.startTime).getTime();
                                        const etaTime = new Date(referenceTimeMs + absIdx * durationPerLeg * 60 * 1000);
                                        const etaText = ` (ETA: ${etaTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;

                                        const cleanStop = getCleanAddressName(stop);
                                        const cleanHome = getCleanAddressName(student.address);
                                        const isHome = cleanStop === cleanHome;
                                        return (
                                          <li key={sIdx} style={{ color: isHome ? 'var(--primary-color)' : 'var(--text-main)', fontWeight: isHome ? 'bold' : 'normal' }}>
                                            {cleanStop} {isHome && "(Your Child's Stop)"} <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{etaText}</span>
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </section>
                  </>
                ) : (
                  <div className="card-panel" style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                    <Map size={48} color="var(--primary-color)" style={{ opacity: 0.6 }} />
                    <h3>No Child Selected</h3>
                    <p style={{ maxWidth: '400px', margin: '0 auto', fontSize: '0.9rem' }}>
                      Please select one of your children above to track their assigned school bus, route stops, and real-time transit updates.
                    </p>
                  </div>
                )}
              </div>

              {/* Right Column: Unified Activity Feed Panel with internal tabs */}
              <div>
                <section className="card-panel" style={{ minHeight: '400px' }} aria-label="Activity Feed Panel">
                  <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>
                    <button 
                      className={`btn btn-sm ${rightColTab === 'alerts' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setRightColTab('alerts')}
                      style={{ minWidth: '95px', borderRadius: '6px' }}
                      aria-pressed={rightColTab === 'alerts'}
                    >
                      Alerts Feed
                    </button>
                    <button 
                      className={`btn btn-sm ${rightColTab === 'history' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setRightColTab('history')}
                      style={{ minWidth: '95px', borderRadius: '6px' }}
                      aria-pressed={rightColTab === 'history'}
                    >
                      History Logs
                    </button>
                  </div>

                  {rightColTab === 'alerts' ? (
                    <div className="notification-feed" role="log" aria-label="System notifications feed">
                      {parentNotifications.length === 0 ? (
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1.5rem 0' }}>
                          No alerts received yet.
                        </div>
                      ) : (
                        parentNotifications.map(n => (
                          <div key={n.notificationId} className={`notification-item alert-${(n.type === 'Attendance Alert' || n.type === 'Delay Alert') ? 'alert' : n.type === 'Bus Started' ? 'started' : 'ended'}`} role="listitem">
                            <div className="notif-details">
                              <div className="notif-msg">{n.message}</div>
                              <div className="notif-time">{new Date(n.timestamp).toLocaleTimeString()}</div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  ) : (
                    <div className="notification-feed" role="log" aria-label="Transit history logs">
                      {studentAttendance.length === 0 ? (
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1.5rem 0' }}>
                          No historical logs found.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.50rem' }}>
                          {studentAttendance.filter(a => selectedStudentId ? a.studentId === selectedStudentId : true).map(a => {
                            const s = students.find(stud => stud.studentId === a.studentId);
                            return (
                              <div key={a.attendanceId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0.75rem', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-color)', fontSize: '0.85rem' }} role="listitem">
                                <div>
                                  <strong>{s ? s.name : a.studentId}</strong>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{a.date} at {a.time}</div>
                                </div>
                                <span className={`badge ${a.status.toLowerCase()}`} aria-label={`Status: ${a.status}`}>{a.status}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              </div>
            </div>
            )
          )}

          {activeTab === 'leave' && (
            linkedStudents.length === 0 ? (
              <div className="card-panel" style={{ textAlign: 'center', padding: '3rem', margin: '0 auto', maxWidth: '600px' }}>
                <Shield size={48} color="var(--warning)" style={{ marginBottom: '1rem' }} />
                <h3>No Student Linked</h3>
                <p>Please submit a request in the <strong>Student Enrollment</strong> tab or contact the administrator to link your child.</p>
              </div>
            ) : (
              <div style={{ maxWidth: '800px', margin: '0 auto' }}>
              {/* Absence & Leave Planner Module */}
              <section className="card-panel" style={{ marginBottom: '1.5rem' }} aria-label="Student Absence and Leave Planner">
                <h3 className="card-title">
                  <span>📅 Absence & Leave Planner</span>
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                  Notify drivers in advance when your child will be absent. Active approved leaves disable the boarding requirements.
                </p>

                <form onSubmit={handleLeaveSubmit} aria-label="Absence request submission form" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', alignItems: 'end', marginBottom: '1.5rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" htmlFor="leave-student-dropdown" style={{ fontSize: '0.75rem' }}>Select Student</label>
                    <select id="leave-student-dropdown" className="form-select" style={{ padding: '0.4rem' }} value={leaveStudentId} onChange={(e) => setLeaveStudentId(e.target.value)} required aria-required="true">
                      <option value="">-- Choose Child --</option>
                      {linkedStudents.map(s => <option key={s.studentId} value={s.studentId}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" htmlFor="leave-date-picker" style={{ fontSize: '0.75rem' }}>Select Date</label>
                    <input type="date" id="leave-date-picker" className="form-input" style={{ padding: '0.4rem' }} value={leaveDate} onChange={(e) => setLeaveDate(e.target.value)} required aria-required="true" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" htmlFor="leave-triptype-dropdown" style={{ fontSize: '0.75rem' }}>Trip Coverage</label>
                    <select id="leave-triptype-dropdown" className="form-select" style={{ padding: '0.4rem', height: '32px', WebkitAppearance: 'menulist' }} value={leaveTripType} onChange={(e) => setLeaveTripType(e.target.value)} required aria-required="true">
                      <option value="Both">Both Trips</option>
                      <option value="Morning">Morning Trip Only</option>
                      <option value="Evening">Evening Trip Only</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" htmlFor="leave-reason-text" style={{ fontSize: '0.75rem' }}>Reason for Absence</label>
                    <input type="text" id="leave-reason-text" className="form-input" style={{ padding: '0.4rem' }} placeholder="e.g. Doctor appointment" value={leaveReason} onChange={(e) => setLeaveReason(e.target.value)} required aria-required="true" />
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ padding: '0.5rem', whiteSpace: 'nowrap' }} aria-label="Submit registered absence leave request">
                    Register Absence
                  </button>
                </form>

                {/* List of submitted leaves */}
                <h4 style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>Upcoming Absence Schedule</h4>
                {(() => {
                  const childLeaves = leaveRequests.filter(l => studentIds.includes(l.studentId));
                  if (childLeaves.length === 0) {
                    return <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No leave requests submitted yet.</div>;
                  }
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {childLeaves.map(l => {
                        const child = linkedStudents.find(s => s.studentId === l.studentId);
                        return (
                          <div key={l.leaveId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-color)', fontSize: '0.8rem' }}>
                            <div>
                              <strong>{child ? child.name : `Student #${l.studentId}`}</strong> — <span style={{ color: 'var(--primary-color)' }}>{l.date}</span>
                              <span style={{ marginLeft: '0.5rem', fontSize: '0.72rem', padding: '0.15rem 0.45rem', backgroundColor: 'rgba(234, 179, 8, 0.1)', color: 'var(--primary-color)', borderRadius: '4px', fontWeight: 'bold' }}>
                                {l.tripType || 'Both'}
                              </span>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Reason: {l.reason}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span className="badge success" style={{ textTransform: 'uppercase', fontSize: '0.65rem' }}>{l.status}</span>
                              <button type="button" className="btn btn-danger btn-sm" onClick={() => cancelLeaveRequest(l.leaveId)} style={{ padding: '0.1rem 0.35rem', fontSize: '0.7rem' }}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </section>
            </div>
            )
          )}

          {activeTab === 'analytics' && (
            linkedStudents.length === 0 ? (
              <div className="card-panel" style={{ textAlign: 'center', padding: '3rem', margin: '0 auto', maxWidth: '600px' }}>
                <Shield size={48} color="var(--warning)" style={{ marginBottom: '1rem' }} />
                <h3>No Student Linked</h3>
                <p>Please submit a request in the <strong>Student Enrollment</strong> tab or contact the administrator to link your child.</p>
              </div>
            ) : (
              <div style={{ maxWidth: '900px', margin: '0 auto' }}>
              {linkedStudents.length > 1 && (
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', justifyContent: 'center' }}>
                  {linkedStudents.map(student => (
                    <button
                      key={student.studentId}
                      className={`btn btn-sm ${selectedStudentId === student.studentId ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setSelectedStudentId(student.studentId)}
                      aria-pressed={selectedStudentId === student.studentId}
                    >
                      {student.name}
                    </button>
                  ))}
                </div>
              )}
              {/* Attendance Analytics Module */}
              <section className="card-panel" aria-label="Attendance Analytics Panel" style={{ marginBottom: '1.5rem' }}>
                <div className="card-title">
                  <span>
                    <TrendingUp size={18} style={{ verticalAlign: 'middle', marginRight: '6px' }} /> 
                    Attendance Analytics & Insights
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {(() => {
                    const attendanceInsights = linkedStudents.map(student => {
                      const records = studentAttendance.filter(a => a.studentId === student.studentId);
                      
                      const dateMap = {};
                      records.forEach(r => {
                        if (!dateMap[r.date]) dateMap[r.date] = [];
                        dateMap[r.date].push(r.status);
                      });

                      let presentDays = 0;
                      let absentDays = 0;
                      
                      Object.keys(dateMap).forEach(date => {
                        const statuses = dateMap[date];
                        if (statuses.includes('Boarded') || statuses.includes('Dropped') || statuses.includes('Present')) {
                          presentDays++;
                        } else if (statuses.includes('Absent')) {
                          absentDays++;
                        }
                      });

                      const totalDays = presentDays + absentDays;
                      const rate = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;

                      const schoolDays = ["2026-06-15", "2026-06-16", "2026-06-17", "2026-06-18", "2026-06-19"];
                      const dailyStatus = schoolDays.map(date => {
                        const statuses = dateMap[date] || [];
                        let status = 'none';
                        if (statuses.includes('Boarded') || statuses.includes('Dropped') || statuses.includes('Present')) {
                          status = 'present';
                        } else if (statuses.includes('Absent')) {
                          status = 'absent';
                        }
                        return { date, status };
                      });

                      return {
                        studentId: student.studentId,
                        name: student.name,
                        presentDays,
                        absentDays,
                        totalDays,
                        rate,
                        dailyStatus
                      };
                    });

                    if (attendanceInsights.length === 0) return null;

                    return (
                      <>
                        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                          <button 
                            className={`btn btn-sm ${attendanceTab === 'weekly' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setAttendanceTab('weekly')}
                            style={{ minWidth: '85px' }}
                          >
                            Weekly Grid
                          </button>
                          <button 
                            className={`btn btn-sm ${attendanceTab === 'monthly' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setAttendanceTab('monthly')}
                            style={{ minWidth: '95px' }}
                          >
                            Monthly View
                          </button>
                          <button 
                            className={`btn btn-sm ${attendanceTab === 'alltime' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setAttendanceTab('alltime')}
                            style={{ minWidth: '90px' }}
                          >
                            All-Time Log
                          </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                          {attendanceInsights.filter(i => i.studentId === selectedStudentId).map(insight => (
                            <div key={insight.studentId} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '1.25rem', backgroundColor: 'var(--bg-color)' }}>
                              
                              {/* Student Metadata Summary Row */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{ position: 'relative', width: '60px', height: '60px' }}>
                                  <svg width="60" height="60" viewBox="0 0 90 90" style={{ transform: 'rotate(-90deg)' }}>
                                    <circle cx="45" cy="45" r="36" fill="transparent" stroke="#f1f5f9" strokeWidth="8" />
                                    <circle 
                                      cx="45" 
                                      cy="45" 
                                      r="36" 
                                      fill="transparent" 
                                      stroke="var(--primary-color)" 
                                      strokeWidth="8" 
                                      strokeDasharray="226.2" 
                                      strokeDashoffset={226.2 - (insight.rate / 100) * 226.2}
                                      strokeLinecap="round"
                                    />
                                  </svg>
                                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                                    <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-main)' }}>
                                      {insight.totalDays > 0 ? `${insight.rate}%` : 'N/A'}
                                    </span>
                                  </div>
                                </div>
                                <div>
                                  <h4 style={{ margin: '0 0 0.25rem 0' }}>{insight.name}'s Attendance Rate</h4>
                                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    Present: <strong style={{ color: 'var(--success)' }}>{insight.presentDays} days</strong> | Absent: <strong style={{ color: 'var(--danger)' }}>{insight.absentDays} days</strong> (All-Time)
                                  </div>
                                </div>
                              </div>

                              {/* Tab Content 1: Weekly Grid */}
                              {attendanceTab === 'weekly' && (
                                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                                  <div style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Calendar size={14} /> Weekly Tracker (Last 5 School Days)
                                  </div>
                                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    {insight.dailyStatus.map((day, dIdx) => {
                                      const dateObj = new Date(day.date);
                                      const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
                                      const isPresent = day.status === 'present';
                                      const isAbsent = day.status === 'absent';
                                      
                                      let bg = 'var(--border-color)';
                                      let color = 'var(--text-muted)';
                                      let title = `${day.date}: No record`;
                                      let icon = '—';
                                      
                                      if (isPresent) {
                                        bg = 'rgba(16, 185, 129, 0.1)';
                                        color = 'var(--success)';
                                        title = `${day.date}: Present`;
                                        icon = '✓';
                                      } else if (isAbsent) {
                                        bg = 'rgba(239, 68, 68, 0.1)';
                                        color = 'var(--danger)';
                                        title = `${day.date}: Absent`;
                                        icon = '✗';
                                      }

                                      return (
                                        <div 
                                          key={dIdx} 
                                          title={title} 
                                          style={{ 
                                            flex: '1', 
                                            display: 'flex', 
                                            flexDirection: 'column', 
                                            alignItems: 'center', 
                                            padding: '0.35rem 0.25rem', 
                                            borderRadius: '6px', 
                                            backgroundColor: bg, 
                                            color: color, 
                                            border: '1px solid transparent', 
                                            fontSize: '0.75rem',
                                            transition: 'all 0.2s',
                                            cursor: 'help'
                                          }}
                                          className="attendance-square-hover"
                                        >
                                          <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', fontWeight: '700', opacity: 0.8 }}>{dayName}</span>
                                          <strong style={{ fontSize: '0.85rem', marginTop: '2px' }}>{icon}</strong>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Tab Content 2: Monthly Calendar */}
                              {attendanceTab === 'monthly' && (() => {
                                const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
                                const firstDayIndex = new Date(selectedYear, selectedMonth, 1).getDay();
                                const firstDayIndexMapped = firstDayIndex === 0 ? 6 : firstDayIndex - 1; // Map Sunday=0 to index 6, Monday=1 to index 0, etc.

                                return (
                                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <div style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '0.75rem', width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <span>📅 Calendar:</span>
                                        <select 
                                          value={selectedMonth} 
                                          onChange={(e) => setSelectedMonth(Number(e.target.value))} 
                                          style={{ padding: '0.15rem 0.4rem', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)', color: 'var(--text-main)', cursor: 'pointer' }}
                                        >
                                          {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((m, idx) => (
                                            <option key={idx} value={idx}>{m}</option>
                                          ))}
                                        </select>
                                        <select 
                                          value={selectedYear} 
                                          onChange={(e) => setSelectedYear(Number(e.target.value))} 
                                          style={{ padding: '0.15rem 0.4rem', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-color)', color: 'var(--text-main)', cursor: 'pointer' }}
                                        >
                                          {[2024, 2025, 2026, 2027, 2028].map(y => (
                                            <option key={y} value={y}>{y}</option>
                                          ))}
                                        </select>
                                      </div>
                                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Hover for details</span>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.35rem', width: '100%', maxWidth: '350px' }}>
                                      {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((h, hIdx) => (
                                        <div key={hIdx} style={{ fontSize: '0.65rem', fontWeight: 'bold', color: 'var(--text-muted)', textAlign: 'center', paddingBottom: '0.2rem' }}>
                                          {h}
                                        </div>
                                      ))}
                                      {/* Empty cells before the first day of the month */}
                                      {Array.from({ length: firstDayIndexMapped }).map((_, emptyIdx) => (
                                        <div key={`empty-${emptyIdx}`} style={{ aspectRatio: '1' }} />
                                      ))}
                                      {/* Days of the month */}
                                      {Array.from({ length: daysInMonth }, (_, idx) => {
                                        const dayNum = idx + 1;
                                        const dateStr = `${selectedYear}-${(selectedMonth + 1).toString().padStart(2, '0')}-${dayNum.toString().padStart(2, '0')}`;
                                        const dayOfWeek = (dayNum + firstDayIndexMapped - 1) % 7;
                                        const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;

                                        const dayRecords = studentAttendance.filter(a => a.studentId === selectedStudentId && a.date === dateStr);
                                        const isAbsent = dayRecords.some(r => r.status === 'Absent');
                                        const isPresent = dayRecords.some(r => r.status === 'Boarded' || r.status === 'Dropped' || r.status === 'Present');
                                        const hasLeave = leaveRequests.some(l => l.studentId === selectedStudentId && l.date === dateStr && l.status === 'Approved');

                                        let bg = 'rgba(255,255,255,0.02)';
                                        let border = '1px solid var(--border-color)';
                                        let color = 'var(--text-muted)';
                                        let titleText = `${dateStr}: No Record`;

                                        if (isWeekend) {
                                          border = '1px solid transparent';
                                          bg = 'rgba(255,255,255,0.01)';
                                          titleText = `${dateStr}: Weekend`;
                                        } else if (hasLeave) {
                                          bg = 'rgba(249, 115, 22, 0.15)';
                                          border = '1px solid rgba(249, 115, 22, 0.3)';
                                          color = 'var(--primary-color)';
                                          titleText = `${dateStr}: Approved Absence / Leave`;
                                        } else if (isPresent) {
                                          bg = 'rgba(16, 185, 129, 0.15)';
                                          border = '1px solid rgba(16, 185, 129, 0.3)';
                                          color = 'var(--success)';
                                          titleText = `${dateStr}: Present (Boarded/Dropped)`;
                                        } else if (isAbsent) {
                                          bg = 'rgba(239, 68, 68, 0.15)';
                                          border = '1px solid rgba(239, 68, 68, 0.3)';
                                          color = 'var(--danger)';
                                          titleText = `${dateStr}: Absent`;
                                        }

                                        return (
                                          <div 
                                            key={idx} 
                                            title={titleText}
                                            style={{ 
                                              aspectRatio: '1',
                                              display: 'flex', 
                                              alignItems: 'center', 
                                              justifyContent: 'center', 
                                              borderRadius: '4px', 
                                              backgroundColor: bg, 
                                              border: border, 
                                              color: color, 
                                              fontSize: '0.75rem',
                                              fontWeight: '600',
                                              cursor: 'help',
                                              transition: 'all 0.15s ease'
                                            }}
                                            className="attendance-square-hover"
                                          >
                                            {dayNum}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })()}

                              {/* Tab Content 3: All-Time Logs Table */}
                              {attendanceTab === 'alltime' && (
                                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                                  <div style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                    🗂️ All-Time Attendance Logs
                                  </div>
                                  <div style={{ maxHeight: '160px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                                      <thead>
                                        <tr style={{ backgroundColor: 'var(--panel-bg)', borderBottom: '1px solid var(--border-color)' }}>
                                          <th style={{ padding: '0.4rem 0.6rem', color: 'var(--text-muted)' }}>Date</th>
                                          <th style={{ padding: '0.4rem 0.6rem', color: 'var(--text-muted)' }}>Time</th>
                                          <th style={{ padding: '0.4rem 0.6rem', color: 'var(--text-muted)' }}>Status</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {studentAttendance.filter(a => a.studentId === selectedStudentId).length === 0 ? (
                                          <tr>
                                            <td colSpan="3" style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>No historical logs found.</td>
                                          </tr>
                                        ) : (
                                          studentAttendance
                                            .filter(a => a.studentId === selectedStudentId)
                                            .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time))
                                            .map((rec, rIdx) => (
                                              <tr key={rIdx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                <td style={{ padding: '0.4rem 0.6rem', fontWeight: '500' }}>{rec.date}</td>
                                                <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-muted)' }}>{rec.time}</td>
                                                <td style={{ padding: '0.4rem 0.6rem' }}>
                                                  <span className={`badge ${rec.status.toLowerCase()}`}>{rec.status}</span>
                                                </td>
                                              </tr>
                                            ))
                                        )}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}

                            </div>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </section>
            </div>
            )
          )}

          {activeTab === 'grievances' && (
            <div className="card-panel">
              <h3 style={{ fontSize: '1.25rem', fontWeight: '800', marginBottom: '1.5rem', borderBottom: '1px dashed var(--border-color)', paddingBottom: '0.75rem' }}>
                ⚠️ Grievance Portal
              </h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }} className="md:grid-cols-2">
                {/* Submit Grievance Form */}
                <div style={{ paddingRight: '1rem' }}>
                  <h4 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '1rem' }}>Submit a New Grievance</h4>
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    if (!grievanceTitle.trim() || !grievanceDescription.trim()) {
                      alert('Please fill out all fields.');
                      return;
                    }
                    const res = await submitGrievance(currentUser.parentId || 1, grievanceTitle, grievanceCategory, grievanceDescription);
                    if (res.success) {
                      alert('Grievance logged successfully. School administration has been notified.');
                      setGrievanceTitle('');
                      setGrievanceDescription('');
                    } else {
                      alert(res.message);
                    }
                  }}>
                    <div className="form-group">
                      <label className="form-label">Title / Subject</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="e.g. Bus delayed consistently" 
                        value={grievanceTitle} 
                        onChange={(e) => setGrievanceTitle(e.target.value)} 
                        required 
                      />
                    </div>
                    
                    <div className="form-group">
                      <label className="form-label">Category</label>
                      <select 
                        className="form-select" 
                        value={grievanceCategory} 
                        onChange={(e) => setGrievanceCategory(e.target.value)}
                        style={{ height: '36px', WebkitAppearance: 'menulist' }}
                      >
                        <option value="Delay">Delay</option>
                        <option value="Speeding">Speeding / Safety</option>
                        <option value="Driver Behavior">Driver Behavior</option>
                        <option value="Bus Condition">Bus Condition</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Detailed Description</label>
                      <textarea 
                        className="form-input" 
                        rows="4" 
                        placeholder="Provide details of the issue..." 
                        value={grievanceDescription} 
                        onChange={(e) => setGrievanceDescription(e.target.value)} 
                        required 
                        style={{ resize: 'vertical' }}
                      />
                    </div>

                    <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem' }}>
                      Submit Grievance
                    </button>
                  </form>
                </div>

                {/* Grievance History List */}
                <div>
                  <h4 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '1rem' }}>Grievance History</h4>
                  {grievances.filter(g => g.parentId === (currentUser.parentId || 1)).length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', border: '1px dashed var(--border-color)', borderRadius: '12px' }}>
                      No grievances logged yet.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '420px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                      {grievances
                        .filter(g => g.parentId === (currentUser.parentId || 1))
                        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                        .map((g) => (
                          <div key={g.grievanceId} style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '8px', backgroundColor: 'rgba(255, 255, 255, 0.01)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                              <span style={{ fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--text-main)' }}>{g.title}</span>
                              <span className={`badge ${g.status === 'Resolved' ? 'completed' : g.status === 'In Progress' ? 'on-trip' : 'absent'}`} style={{ fontSize: '0.7rem' }}>
                                {g.status}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                              Category: <strong>{g.category}</strong>
                            </div>
                            <p style={{ fontSize: '0.8rem', margin: '0 0 0.5rem 0', color: 'var(--text-main)', lineHeight: '1.4' }}>
                              {g.description}
                            </p>
                            {g.resolutionNotes && (
                              <div style={{ marginTop: '0.5rem', padding: '0.6rem 0.8rem', backgroundColor: 'rgba(16, 185, 129, 0.06)', borderLeft: '3px solid var(--success)', borderRadius: '4px' }}>
                                <div style={{ fontSize: '0.72rem', fontWeight: 'bold', color: 'var(--success)', marginBottom: '0.15rem' }}>Admin Resolution Notes:</div>
                                <div style={{ fontSize: '0.76rem', color: 'var(--text-main)' }}>{g.resolutionNotes}</div>
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'enrollment' && (
            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
              <section className="card-panel" style={{ marginBottom: '1.5rem' }}>
                <h3 className="card-title">
                  <span>🏫 Request Student Enrollment</span>
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                  Enter your child's details to request enrollment in the school bus service. Once approved by the administrator, they will be registered and linked to your account.
                </p>

                {enrollError && <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>{enrollError}</div>}
                {enrollSuccess && <div className="alert alert-success" style={{ marginBottom: '1rem' }}>{enrollSuccess}</div>}

                <form onSubmit={handleEnrollSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-group">
                      <label className="form-label" htmlFor="enroll-name">Student Full Name *</label>
                      <input
                        type="text"
                        id="enroll-name"
                        className="form-input"
                        placeholder="John Doe"
                        value={enrollName}
                        onChange={(e) => setEnrollName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="enroll-class">Grade / Class *</label>
                      <input
                        type="text"
                        id="enroll-class"
                        className="form-input"
                        placeholder="5"
                        value={enrollClass}
                        onChange={(e) => setEnrollClass(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-group">
                      <label className="form-label" htmlFor="enroll-section">Section *</label>
                      <input
                        type="text"
                        id="enroll-section"
                        className="form-input"
                        placeholder="A"
                        value={enrollSection}
                        onChange={(e) => setEnrollSection(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="enroll-address">Home Address *</label>
                      <input
                        type="text"
                        id="enroll-address"
                        className="form-input"
                        placeholder="123 Main St, Coimbatore"
                        value={enrollAddress}
                        onChange={(e) => setEnrollAddress(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-group">
                      <label className="form-label" htmlFor="enroll-phone">Contact Phone (Optional)</label>
                      <input
                        type="text"
                        id="enroll-phone"
                        className="form-input"
                        placeholder="+91 XXXXXXXXXX"
                        value={enrollPhone}
                        onChange={(e) => setEnrollPhone(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="enroll-email">Contact Email (Optional)</label>
                      <input
                        type="email"
                        id="enroll-email"
                        className="form-input"
                        placeholder="child@example.com"
                        value={enrollEmail}
                        onChange={(e) => setEnrollEmail(e.target.value)}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-group">
                      <label className="form-label" htmlFor="enroll-route">Preferred Route (Optional)</label>
                      <select
                        id="enroll-route"
                        className="form-select"
                        value={enrollRouteId}
                        onChange={(e) => {
                          setEnrollRouteId(e.target.value);
                          const routeStudents = students.filter(s => s.routeId === Number(e.target.value));
                          const currentBusId = routeStudents.length > 0 ? (routeStudents[0].busId || '') : '';
                          setEnrollBusId(currentBusId ? currentBusId.toString() : '');
                        }}
                      >
                        <option value="">-- Select Route --</option>
                        {routes.map(r => (
                          <option key={r.routeId} value={r.routeId}>{r.routeName} ({r.distance})</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="enroll-bus">Preferred Bus (Optional)</label>
                      <select
                        id="enroll-bus"
                        className="form-select"
                        value={enrollBusId}
                        onChange={(e) => setEnrollBusId(e.target.value)}
                      >
                        <option value="">-- Select Bus --</option>
                        {buses.map(b => (
                          <option key={b.busId} value={b.busId}>{b.busNumber} (Driver: {drivers.find(d => d.driverId === b.driverId)?.name || 'None'})</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem', padding: '0.6rem' }}>
                    Submit Enrollment Request
                  </button>
                </form>
              </section>

              <section className="card-panel">
                <h3 className="card-title">
                  <span>📋 Enrollment Status & History</span>
                </h3>
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Class</th>
                        <th>Route</th>
                        <th>Address</th>
                        <th>Status</th>
                        <th>Requested Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {studentRequests.length === 0 ? (
                        <tr>
                          <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                            No enrollment requests submitted yet.
                          </td>
                        </tr>
                      ) : (
                        studentRequests.map(req => (
                          <tr key={req.requestId}>
                            <td style={{ fontWeight: 'bold' }}>{req.name}</td>
                            <td>{req.studentClass}-{req.section}</td>
                            <td>{routes.find(r => r.routeId === req.routeId)?.routeName || 'Not Specified'}</td>
                            <td>{getCleanAddressName(req.address)}</td>
                            <td>
                              <span style={{ 
                                display: 'inline-block',
                                padding: '0.25rem 0.5rem', 
                                borderRadius: '4px', 
                                fontWeight: 'bold', 
                                fontSize: '0.75rem',
                                backgroundColor: req.status === 'APPROVED' ? '#f0fdf4' : req.status === 'REJECTED' ? '#fef2f2' : '#fffbeb',
                                color: req.status === 'APPROVED' ? '#16a34a' : req.status === 'REJECTED' ? '#dc2626' : '#d97706'
                              }}>
                                {req.status}
                              </span>
                            </td>
                            <td>{req.createdAt ? new Date(req.createdAt).toLocaleDateString() : 'N/A'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}
        </>
      {/* Floating Chatbot Assistant */}
      <button 
        className="chatbot-float-btn" 
        onClick={() => setIsChatOpen(!isChatOpen)}
        title="Smart School Bus Assistant Chatbot"
        aria-label={isChatOpen ? "Close Smart School Bus Assistant Chatbot Window" : "Open Smart School Bus Assistant Chatbot Window"}
        aria-expanded={isChatOpen}
      >
        {isChatOpen ? <X size={26} /> : <MessageSquare size={26} />}
      </button>

      {isChatOpen && (
        <div className="chatbot-window" role="dialog" aria-modal="true" aria-label="Smart School Bus Assistant Chat Window">
          <div className="chatbot-header">
            <div className="chatbot-header-title">
              <Bot size={20} aria-hidden="true" />
              <span>Smart School Bus Assistant</span>
            </div>
            <button className="chatbot-close-btn" onClick={() => setIsChatOpen(false)} aria-label="Close Smart School Bus Assistant Chat Window">
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          <div className="chatbot-messages" role="log" aria-label="Chat messages log" aria-live="polite">
            {chatMessages.map(msg => (
              <div key={msg.id} className={`chat-bubble ${msg.sender}`} aria-label={`Message from ${msg.sender === 'bot' ? 'Assistant' : 'You'}`}>
                <div style={{ whiteSpace: 'pre-line' }}>{msg.text}</div>
                <span className="chat-time">{msg.timestamp}</span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <div className="chatbot-quick-actions" role="group" aria-label="Quick preset queries">
            <button className="quick-action-pill" onClick={() => handleSendChat("📍 Where is the bus position right now?")} aria-label="Query bus current position">
              📍 Bus Position
            </button>
            <button className="quick-action-pill" onClick={() => handleSendChat("⏱️ Estimate bus arrival time")} aria-label="Query estimated arrival time">
              ⏱️ Arrival Estimate
            </button>
            <button className="quick-action-pill" onClick={() => handleSendChat("📞 Driver contact info")} aria-label="Query driver contact information">
              📞 Driver Contact
            </button>
            <button className="quick-action-pill" onClick={() => handleSendChat("⚠️ Is the bus off-route?")} aria-label="Query geofence status off route checks">
              ⚠️ Geofence Check
            </button>
          </div>

          <form 
            className="chatbot-input-area" 
            onSubmit={(e) => {
              e.preventDefault();
              handleSendChat();
            }}
            aria-label="Chatbot prompt submitter"
          >
            <input 
              type="text" 
              className="chatbot-input" 
              placeholder="Ask about bus position or arrival..." 
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              aria-label="Ask a question to Smart School Bus Assistant"
              aria-required="true"
            />
            <button type="submit" className="chatbot-send-btn" aria-label="Send message">
              <Send size={16} aria-hidden="true" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
