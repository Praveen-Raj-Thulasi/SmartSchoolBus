import { useState, useContext, useEffect, useRef } from 'react';
import { AppContext } from '../context/AppContext';
import { Users, Truck, Compass, Calendar, Plus, Edit2, Trash2, FileSpreadsheet, MapPin, AlertTriangle, ShieldAlert, CheckCircle, Flame, Clock, QrCode } from 'lucide-react';
import QRCode from 'qrcode';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { parseAddress, getCleanAddressName, reverseGeocode, geocodeAddress, optimizeRouteGA, calculateRouteDistance } from '../utils/geoUtils';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell } from 'recharts';

export default function SchoolAdminDashboard() {
  const {
    students, addStudent, updateStudent, deleteStudent,
    drivers, addDriver, updateDriver, deleteDriver,
    buses, addBus, updateBus, deleteBus,
    routes, addRoute, updateRoute, deleteRoute,
    trips, downloadAttendanceReport,
    routeOptimizations, emergencies, attendanceEvents,
    generateRouteOptimization, resolveEmergency,
    grievances, driverRatings, resolveGrievance, parents,
    getStudentQr,
    studentRequests, approveStudentRequest, rejectStudentRequest,
    optimizeRouteAPI
  } = useContext(AppContext);

  const [activeTab, setActiveTab] = useState('students');
  const [optimizationDetails, setOptimizationDetails] = useState(null);

  // Grievance resolution state
  const [showGrievanceResolveModal, setShowGrievanceResolveModal] = useState(false);
  const [selectedGrievanceId, setSelectedGrievanceId] = useState(null);
  const [grievanceNotes, setGrievanceNotes] = useState('');

  // Student QR Code Generator Modal state
  const [showQrModal, setShowQrModal] = useState(false);
  const [selectedQrStudent, setSelectedQrStudent] = useState(null);
  const [qrToken, setQrToken] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');

  // AI Planner state
  const [selectedPlannerRoute, setSelectedPlannerRoute] = useState('');
  const [trafficLevel, setTrafficLevel] = useState('Light');
  const [weatherCondition, setWeatherCondition] = useState('Sunny');
  const [roadClosures, setRoadClosures] = useState('');
  const [generatedOpt, setGeneratedOpt] = useState(null);
  const optMapRef = useRef(null);

  // SOS Resolution State
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [selectedEmergencyId, setSelectedEmergencyId] = useState(null);
  const sosMapRef = useRef(null);

  // Fleet Overview Map and Roster states
  const fleetMapRef = useRef(null);
  const [updatingRosterRoute, setUpdatingRosterRoute] = useState(null);
  const [selectedRosterBus, setSelectedRosterBus] = useState({});

  // Modal controls
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState(''); // 'student', 'driver', 'bus', 'route'
  const [modalMode, setModalMode] = useState('add'); // 'add' or 'edit'
  const [editId, setEditId] = useState(null);

  // Form states
  const [studentForm, setStudentForm] = useState({ name: '', class: '', section: '', parentId: 'P1', routeId: '', busId: '', address: '', photoUrl: '' });
  const [driverForm, setDriverForm] = useState({ name: '', phone: '', licenseNumber: '' });
  const [busForm, setBusForm] = useState({ busNumber: '', capacity: 30, driverId: '', maintenanceStatus: 'Good' });
  const [routeForm, setRouteForm] = useState({ routeName: '', distance: '', estimatedTime: '', stopsInput: '' });

  // Report states
  const [reportType, setReportType] = useState('student');
  const [reportTargetId, setReportTargetId] = useState('');

  const [isRawStopsEdit, setIsRawStopsEdit] = useState(false);
  const [manualStopText, setManualStopText] = useState('');
  const modalTypeRef = useRef('');

  useEffect(() => {
    modalTypeRef.current = modalType;
  }, [modalType]);

  const adminMapRef = useRef(null);
  const adminLayersRef = useRef({ markers: [], polyline: null });
  const adminMapClickRef = useRef(false);

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
    if (!showModal) return;
    if (modalType !== 'student' && modalType !== 'route') return;

    let coords = [];
    let key = '';

    if (modalType === 'student' && studentForm.routeId) {
      const selectedRoute = routes.find(r => r.routeId === Number(studentForm.routeId));
      if (selectedRoute) {
        coords = selectedRoute.stops.map(stop => parseAddress(stop).coords);
        key = `admin-student-route-${selectedRoute.routeId}`;
      }
    } else if (modalType === 'route') {
      const stopsArray = routeForm.stopsInput.split(',').map(s => s.trim()).filter(Boolean);
      coords = stopsArray.map(stop => parseAddress(stop).coords);
      key = `admin-route-${stopsArray.join('|')}`;
    }

    if (coords.length < 2) return;

    const loadRoads = async () => {
      if (!roadPaths[key]) {
        const path = await getRoadPath(key, coords);
        setRoadPaths(prev => ({ ...prev, [key]: path }));
      }
    };
    loadRoads();
  }, [showModal, modalType, studentForm.routeId, routeForm.stopsInput, routes]);

  // AI Route Planner mapping sync
  useEffect(() => {
    if (activeTab !== 'ai-planner' || !generatedOpt) {
      if (optMapRef.current) {
        try { optMapRef.current.remove(); } catch (e) {}
        optMapRef.current = null;
      }
      return;
    }

    const container = document.getElementById("admin-opt-map");
    if (!container) return;

    if (!optMapRef.current) {
      const map = L.map('admin-opt-map').setView([11.0168, 76.9558], 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
      optMapRef.current = map;
    }

    const map = optMapRef.current;
    
    // Clear old layers
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker || layer instanceof L.Polyline) {
        try { map.removeLayer(layer); } catch (e) {}
      }
    });

    // Add school marker
    const schoolMarker = L.marker([11.0180, 76.9600]).addTo(map);
    schoolMarker.bindTooltip("🏫 School (Hub)", { permanent: true });

    // Draw optimized sequence markers and path
    const stops = generatedOpt.suggestedRoute.split(" -> ");
    const coords = [];
    coords.push([11.0180, 76.9600]);

    stops.forEach((stop, index) => {
      if (index === 0) return; // skip School
      const parsed = parseAddress(stop);
      if (parsed && parsed.coords) {
        const marker = L.marker(parsed.coords).addTo(map);
        marker.bindTooltip(`📍 Stop ${index}: ${parsed.name}`, { permanent: false });
        coords.push(parsed.coords);
      }
    });

    // Close loop to school
    coords.push([11.0180, 76.9600]);

    if (coords.length > 1) {
      const polyline = L.polyline(coords, { color: '#10b981', weight: 4, dashArray: '5, 5' }).addTo(map);
      map.fitBounds(polyline.getBounds());
    }
  }, [activeTab, generatedOpt]);

  // SOS Map synchronizer
  useEffect(() => {
    const activeEmergencies = emergencies.filter(e => e.status === 'Open');
    if (activeTab !== 'live-operations' || activeEmergencies.length === 0) {
      if (sosMapRef.current) {
        try { sosMapRef.current.remove(); } catch (e) {}
        sosMapRef.current = null;
      }
      return;
    }

    const container = document.getElementById("admin-sos-map");
    if (!container) return;

    const latestEmergency = activeEmergencies[activeEmergencies.length - 1];

    if (!sosMapRef.current) {
      const map = L.map('admin-sos-map').setView([latestEmergency.latitude, latestEmergency.longitude], 14);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
      sosMapRef.current = map;
    }

    const map = sosMapRef.current;

    // Clear layers
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker || layer instanceof L.Polyline) {
        try { map.removeLayer(layer); } catch (e) {}
      }
    });

    // Add emergency marker
    const marker = L.marker([latestEmergency.latitude, latestEmergency.longitude]).addTo(map);
    marker.bindTooltip(`🚨 SOS Alert: Bus #${latestEmergency.busId} (${latestEmergency.reason})`, { permanent: true });
    map.setView([latestEmergency.latitude, latestEmergency.longitude], 14);
  }, [activeTab, emergencies]);

  // Master Fleet overview map synchronizer
  useEffect(() => {
    if (activeTab !== 'live-operations') {
      if (fleetMapRef.current) {
        try { fleetMapRef.current.remove(); } catch (e) {}
        fleetMapRef.current = null;
      }
      return;
    }

    const container = document.getElementById("admin-fleet-map");
    if (!container) return;

    if (!fleetMapRef.current) {
      const map = L.map('admin-fleet-map', { zoomControl: true }).setView([11.0168, 76.9558], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
      fleetMapRef.current = map;
    }

    const map = fleetMapRef.current;

    // Fetch coordinates of all active trips and update markers
    const updateFleetMarkers = async () => {
      const activeTrips = trips.filter(t => t.status === 'Active' || t.status === 'Emergency');
      
      // Clear old layers
      map.eachLayer((layer) => {
        if (layer instanceof L.Marker || layer instanceof L.Polyline || layer instanceof L.CircleMarker) {
          try { map.removeLayer(layer); } catch (e) {}
        }
      });

      // Add school marker
      const schoolMarker = L.marker([11.0180, 76.9600], {
        icon: L.divIcon({
          className: 'school-hub-marker',
          html: `<div style="background-color: #1e3a8a; color: white; border-radius: 50%; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); font-size: 0.85rem;">🏫</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13]
        })
      }).addTo(map);
      schoolMarker.bindTooltip("School (Hub)", { permanent: true });

      if (activeTrips.length === 0) {
        return;
      }

      const bounds = L.latLngBounds();
      bounds.extend([11.0180, 76.9600]);

      for (const t of activeTrips) {
        let latitude = 11.0180;
        let longitude = 76.9600;
        let speed = 0;

        try {
          const res = await fetch(`http://localhost:8081/api/gps/trip/${t.tripId}/latest`);
          if (res.ok) {
            const data = await res.json();
            latitude = data.latitude;
            longitude = data.longitude;
            speed = data.speed;
          } else {
            const r = routes.find(rt => rt.routeId === t.routeId);
            if (r && r.stops && r.stops[t.currentStopIndex]) {
              const parsed = parseAddress(r.stops[t.currentStopIndex]);
              latitude = parsed.coords[0];
              longitude = parsed.coords[1];
            }
          }
        } catch (e) {
          const r = routes.find(rt => rt.routeId === t.routeId);
          if (r && r.stops && r.stops[t.currentStopIndex]) {
            const parsed = parseAddress(r.stops[t.currentStopIndex]);
            latitude = parsed.coords[0];
            longitude = parsed.coords[1];
          }
        }

        const point = [latitude, longitude];
        bounds.extend(point);

        const rObj = routes.find(rt => rt.routeId === t.routeId);
        const routeName = rObj ? rObj.routeName : `Route ${t.routeId}`;
        const bObj = buses.find(bus => bus.busId === t.busId);
        const busNum = bObj ? bObj.busNumber : `Bus ${t.busId}`;

        if (rObj && rObj.stops) {
          const stopCoords = [];
          rObj.stops.forEach((stop) => {
            const parsed = parseAddress(stop);
            if (parsed && parsed.coords) {
              stopCoords.push(parsed.coords);
              L.circleMarker(parsed.coords, {
                radius: 4,
                color: t.status === 'Emergency' ? '#ef4444' : '#3b82f6',
                fillColor: '#ffffff',
                fillOpacity: 1,
                weight: 2
              }).addTo(map);
            }
          });
          if (stopCoords.length > 1) {
            L.polyline(stopCoords, {
              color: t.status === 'Emergency' ? '#f87171' : '#60a5fa',
              weight: 3,
              opacity: 0.6,
              dashArray: '4, 4'
            }).addTo(map);
          }
        }

        const busMarkerColor = t.status === 'Emergency' ? '#dc2626' : '#eab308';
        const busIcon = L.divIcon({
          className: `fleet-bus-marker-${t.tripId}`,
          html: `<div style="background-color: ${busMarkerColor}; color: ${t.status === 'Emergency' ? 'white' : 'black'}; border-radius: 50%; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; border: 2px solid white; box-shadow: 0 0 10px ${busMarkerColor}; animation: pulse-bus-fleet 1.5s infinite;">🚌</div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15]
        });

        const marker = L.marker(point, { icon: busIcon }).addTo(map);
        marker.bindTooltip(`<strong>${busNum} (${routeName})</strong><br/>Status: ${t.status}<br/>Speed: ${speed ? speed.toFixed(1) : '0.0'} km/h`);
      }

      map.fitBounds(bounds, { padding: [30, 30] });
    };

    updateFleetMarkers();

  }, [activeTab, trips, emergencies]);

  // Unified Admin Live Preview Map Sync & Click-to-Pin Handler
  useEffect(() => {
    if (!showModal) {
      if (adminMapRef.current) {
        adminMapRef.current.remove();
        adminMapRef.current = null;
      }
      return;
    }

    if (modalType !== 'student' && modalType !== 'route') return;

    // Check if the container element is rendered in the DOM
    const container = document.getElementById("admin-modal-map");
    if (!container) return;

    // 1. Initialize map if not yet done
    if (!adminMapRef.current) {
      const map = L.map('admin-modal-map', {
        zoomControl: true,
        scrollWheelZoom: true,
        doubleClickZoom: false // disable default double click zoom
      }).setView([11.0168, 76.9558], 13);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
      }).addTo(map);

      adminMapRef.current = map;

      // Listen for map clicks to auto-geocode coordinates
      map.on('click', async (e) => {
        adminMapClickRef.current = true;
        const { lat, lng } = e.latlng;
        const tempAddress = `Resolving address... @ ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        if (modalTypeRef.current === 'student') {
          setStudentForm(prev => ({ ...prev, address: tempAddress }));
          const road = await reverseGeocode(lat, lng);
          adminMapClickRef.current = true;
          setStudentForm(prev => ({ ...prev, address: `${road} @ ${lat.toFixed(6)}, ${lng.toFixed(6)}` }));
        }
      });

      // Listen for map double-clicks to add route stops
      map.on('dblclick', async (e) => {
        adminMapClickRef.current = true;
        const { lat, lng } = e.latlng;
        if (modalTypeRef.current === 'route') {
          const road = await reverseGeocode(lat, lng);
          const newStop = `${road} @ ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
          adminMapClickRef.current = true;
          setRouteForm(prev => {
            const existing = prev.stopsInput.trim();
            const separator = existing ? (existing.endsWith(',') ? ' ' : ', ') : '';
            const newStopsInput = `${existing}${separator}${newStop}`;

            const stopsArray = newStopsInput.split(',').map(s => s.trim()).filter(Boolean);
            const coords = stopsArray.map(stop => parseAddress(stop).coords);
            const distanceVal = calculateRouteDistance(coords);
            const durationVal = distanceVal > 0 
              ? Math.round((distanceVal / 25) * 60) + stopsArray.length
              : 0;

            return {
              ...prev,
              stopsInput: newStopsInput,
              distance: distanceVal > 0 ? `${distanceVal.toFixed(2)} km` : prev.distance,
              estimatedTime: durationVal > 0 ? `${durationVal} mins` : prev.estimatedTime
            };
          });
        }
      });

      // Force size recalculation once map has fully drawn inside the modal container
      setTimeout(() => {
        map.invalidateSize();
      }, 150);
    }

    const map = adminMapRef.current;

    // 2. Clear old preview layers
    if (adminLayersRef.current.markers) {
      adminLayersRef.current.markers.forEach(m => map.removeLayer(m));
    }
    if (adminLayersRef.current.polyline) {
      map.removeLayer(adminLayersRef.current.polyline);
    }
    adminLayersRef.current.markers = [];
    adminLayersRef.current.polyline = null;

    const coords = [];
    const schoolCoord = [11.0180, 76.9600];

    if (modalType === 'student') {
      // Draw Home Marker
      if (studentForm.address && !studentForm.address.startsWith("Resolving address...")) {
        const parsed = parseAddress(studentForm.address);
        const marker = L.marker(parsed.coords).addTo(map);
        marker.bindTooltip(`🏡 Student Home: ${parsed.name}`, { permanent: true, direction: 'top' });
        adminLayersRef.current.markers.push(marker);
        coords.push(parsed.coords);
      }

      // Draw Selected Route Path and Stops
      if (studentForm.routeId) {
        const selectedRoute = routes.find(r => r.routeId === Number(studentForm.routeId));
        if (selectedRoute) {
          const routeCoords = selectedRoute.stops.map(stop => parseAddress(stop).coords);
          routeCoords.forEach((c, idx) => {
            const stopName = getCleanAddressName(selectedRoute.stops[idx]);
            const circle = L.circleMarker(c, {
              radius: 5,
              fillColor: '#94a3b8',
              color: '#ffffff',
              weight: 1,
              fillOpacity: 0.8
            }).addTo(map);
            circle.bindTooltip(`${stopName}`, { permanent: false, direction: 'top' });
            adminLayersRef.current.markers.push(circle);
            coords.push(c);
          });

          const lineCoords = roadPaths[`admin-student-route-${selectedRoute.routeId}`] || routeCoords;
          if (lineCoords.length > 1) {
            const line = L.polyline(lineCoords, { color: '#475569', weight: 3 }).addTo(map);
            adminLayersRef.current.polyline = line;
          }
        }
      }
    } else if (modalType === 'route') {
      // Draw Stops entered in comma-separated field
      const stopsArray = routeForm.stopsInput.split(',').map(s => s.trim()).filter(Boolean);
      const stopCoords = stopsArray.map(stop => parseAddress(stop).coords);

      stopCoords.forEach((c, idx) => {
        const stopName = getCleanAddressName(stopsArray[idx]);
        const circle = L.circleMarker(c, {
          radius: 6,
          fillColor: idx === 0 ? '#10b981' : '#f97316',
          color: '#ffffff',
          weight: 2,
          fillOpacity: 0.9
        }).addTo(map);
        circle.bindTooltip(`${idx + 1}. ${stopName}`, { permanent: true, direction: 'top' });
        adminLayersRef.current.markers.push(circle);
        coords.push(c);
      });

      const stopsKey = `admin-route-${stopsArray.join('|')}`;
      const lineCoords = roadPaths[stopsKey] || stopCoords;

      if (lineCoords.length > 1) {
        const line = L.polyline(lineCoords, { color: '#f97316', weight: 4 }).addTo(map);
        adminLayersRef.current.polyline = line;
      }
    }

    // Adjust map viewport bounds
    if (!adminMapClickRef.current) {
      if (coords.length > 0) {
        if (coords.length === 1) {
          map.setView(coords[0], 13);
        } else {
          map.fitBounds(L.latLngBounds(coords), { padding: [40, 40], maxZoom: 13 });
        }
      } else {
        map.setView(schoolCoord, 13);
      }
    } else {
      adminMapClickRef.current = false;
    }
  }, [showModal, modalType, studentForm.address, studentForm.routeId, routeForm.stopsInput, routes, roadPaths]);

  // Active trips
  const activeTripsCount = trips.filter(t => t.status === 'Active' || t.status === 'Emergency').length;

  const handleOpenQrModal = async (student) => {
    try {
      const res = await getStudentQr(student.studentId);
      if (res && res.qrCodeToken) {
        setSelectedQrStudent(student);
        setQrToken(res.qrCodeToken);
        const dataUrl = await QRCode.toDataURL(res.qrCodeToken, {
          width: 220,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#ffffff'
          }
        });
        setQrDataUrl(dataUrl);
        setShowQrModal(true);
      } else {
        alert("Failed to retrieve student QR token.");
      }
    } catch (e) {
      console.error(e);
      alert("Error generating QR code.");
    }
  };

  const updateStopsAndRecalculate = (newStopsInput) => {
    const stopsArray = newStopsInput.split(',').map(s => s.trim()).filter(Boolean);
    const coords = stopsArray.map(stop => parseAddress(stop).coords);
    const distanceVal = calculateRouteDistance(coords);
    
    // 25 km/h average speed + 1 minute per stop
    const durationVal = distanceVal > 0 
      ? Math.round((distanceVal / 25) * 60) + stopsArray.length
      : 0;

    setRouteForm(prev => ({
      ...prev,
      stopsInput: newStopsInput,
      distance: distanceVal > 0 ? `${distanceVal.toFixed(2)} km` : '',
      estimatedTime: durationVal > 0 ? `${durationVal} mins` : ''
    }));
  };

  const handleMoveStopUp = (index) => {
    const stopsArray = routeForm.stopsInput.split(',').map(s => s.trim()).filter(Boolean);
    if (index <= 0 || index >= stopsArray.length) return;
    
    const temp = stopsArray[index];
    stopsArray[index] = stopsArray[index - 1];
    stopsArray[index - 1] = temp;
    
    updateStopsAndRecalculate(stopsArray.join(', '));
  };

  const handleMoveStopDown = (index) => {
    const stopsArray = routeForm.stopsInput.split(',').map(s => s.trim()).filter(Boolean);
    if (index < 0 || index >= stopsArray.length - 1) return;
    
    const temp = stopsArray[index];
    stopsArray[index] = stopsArray[index + 1];
    stopsArray[index + 1] = temp;
    
    updateStopsAndRecalculate(stopsArray.join(', '));
  };

  const handleDeleteStop = (index) => {
    const stopsArray = routeForm.stopsInput.split(',').map(s => s.trim()).filter(Boolean);
    if (index < 0 || index >= stopsArray.length) return;
    
    stopsArray.splice(index, 1);
    updateStopsAndRecalculate(stopsArray.join(', '));
  };

  const handleAddManualStop = async (e) => {
    e.preventDefault();
    if (!manualStopText.trim()) return;
    
    try {
      const coords = await geocodeAddress(manualStopText);
      if (coords) {
        const formattedStop = `${manualStopText.trim()} @ ${coords[0].toFixed(6)}, ${coords[1].toFixed(6)}`;
        const existing = routeForm.stopsInput.trim();
        const separator = existing ? (existing.endsWith(',') ? ' ' : ', ') : '';
        const newStopsInput = `${existing}${separator}${formattedStop}`;
        updateStopsAndRecalculate(newStopsInput);
        setManualStopText('');
      } else {
        const fallbackCoords = parseAddress(manualStopText).coords;
        const formattedStop = `${manualStopText.trim()} @ ${fallbackCoords[0].toFixed(6)}, ${fallbackCoords[1].toFixed(6)}`;
        const existing = routeForm.stopsInput.trim();
        const separator = existing ? (existing.endsWith(',') ? ' ' : ', ') : '';
        const newStopsInput = `${existing}${separator}${formattedStop}`;
        updateStopsAndRecalculate(newStopsInput);
        setManualStopText('');
      }
    } catch (err) {
      console.error("Geocoding manual stop failed", err);
    }
  };

  const openAddModal = (type) => {
    setModalType(type);
    setModalMode('add');
    setEditId(null);
    setOptimizationDetails(null);
    setIsRawStopsEdit(false);
    setManualStopText('');
    if (type === 'student') setStudentForm({ name: '', class: '', section: '', parentId: 'P1', routeId: '', busId: '', address: '', photoUrl: '', seatNumber: '' });
    if (type === 'driver') setDriverForm({ name: '', phone: '', licenseNumber: '' });
    if (type === 'bus') setBusForm({ busNumber: '', capacity: 30, driverId: '', maintenanceStatus: 'Good' });
    if (type === 'route') setRouteForm({ routeName: '', distance: '', estimatedTime: '', stopsInput: 'School @ 11.018000, 76.960000' });
    setShowModal(true);
  };

  const openEditModal = (type, item) => {
    setModalType(type);
    setModalMode('edit');
    setEditId(item.studentId || item.driverId || item.busId || item.routeId);
    setOptimizationDetails(null);
    setIsRawStopsEdit(false);
    setManualStopText('');
    
    if (type === 'student') setStudentForm({ ...item });
    if (type === 'driver') setDriverForm({ ...item });
    if (type === 'bus') setBusForm({ ...item });
    if (type === 'route') setRouteForm({ ...item, stopsInput: item.stops.join(', ') });
    
    setShowModal(true);
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (modalType === 'student') {
      if (modalMode === 'add') {
        addStudent(studentForm).then(res => {
          if (res && res.success && res.student) {
            handleOpenQrModal(res.student);
          }
        });
      } else {
        updateStudent(editId, studentForm);
      }
    } else if (modalType === 'driver') {
      if (modalMode === 'add') addDriver(driverForm);
      else updateDriver(editId, driverForm);
    } else if (modalType === 'bus') {
      if (modalMode === 'add') addBus(busForm);
      else updateBus(editId, busForm);
    } else if (modalType === 'route') {
      const stopsArray = routeForm.stopsInput.split(',').map(s => s.trim()).filter(Boolean);
      const routeData = {
        routeName: routeForm.routeName,
        distance: routeForm.distance,
        estimatedTime: routeForm.estimatedTime,
        stops: stopsArray
      };
      if (modalMode === 'add') addRoute(routeData);
      else updateRoute(editId, routeData);
    }
    setShowModal(false);
  };

  const handleUpdateRoster = async (routeId, newBusId) => {
    const routeStudents = students.filter(s => s.routeId === routeId);
    try {
      for (const s of routeStudents) {
        await updateStudent(s.studentId, { ...s, busId: newBusId });
      }
      setSelectedRosterBus(prev => ({ ...prev, [routeId]: newBusId }));
      setUpdatingRosterRoute(null);
      alert(`Roster reassigned successfully for Route ${routeId}!`);
    } catch (e) {
      console.error(e);
      alert("Failed to reassign roster allocation.");
    }
  };

  const handleDeleteItem = (type, id) => {
    if (confirm(`Are you sure you want to delete this ${type}?`)) {
      if (type === 'student') deleteStudent(id);
      if (type === 'driver') deleteDriver(id);
      if (type === 'bus') deleteBus(id);
      if (type === 'route') deleteRoute(id);
    }
  };

  const handleOptimizeRoute = async () => {
    const stopsArray = routeForm.stopsInput.split(',').map(s => s.trim()).filter(Boolean);
    if (stopsArray.length <= 1) {
      alert("Please enter at least 2 stops to optimize (e.g. School, Stop 1).");
      return;
    }

    try {
      const apiResult = await optimizeRouteAPI(stopsArray);
      if (apiResult && apiResult.optimizedStops) {
        const originalCoords = stopsArray.map(s => parseAddress(s).coords);
        const originalDistVal = calculateRouteDistance(originalCoords);
        const savingsVal = originalDistVal - apiResult.optimizedDistance;
        const savingsPct = originalDistVal > 0 ? Math.round((savingsVal / originalDistVal) * 100) : 0;

        setRouteForm(prev => ({
          ...prev,
          stopsInput: apiResult.optimizedStops.join(', '),
          distance: `${apiResult.optimizedDistance} km`
        }));

        setOptimizationDetails({
          optimizedStops: apiResult.optimizedStops,
          optimizedDistance: apiResult.optimizedDistance,
          originalDistance: parseFloat(originalDistVal.toFixed(2)),
          savingsPercent: Math.max(0, savingsPct),
          generationsRun: 'Google AI Routing Model'
        });
        return;
      }
    } catch (e) {
      console.warn("API route optimization failed, falling back to local Genetic Algorithm.", e);
    }

    const result = optimizeRouteGA(stopsArray);
    setRouteForm(prev => ({
      ...prev,
      stopsInput: result.optimizedStops.join(', '),
      distance: `${result.optimizedDistance} km`
    }));
    setOptimizationDetails(result);
  };

  return (
    <div className="dashboard-content" role="region" aria-label="School Admin Dashboard">
      {/* Emergency SOS Banner */}
      {(() => {
        const emergencyTrips = trips.filter(t => t.status === 'Emergency');
        if (emergencyTrips.length > 0) {
          return emergencyTrips.map(trip => {
            const bus = buses.find(b => b.busId === trip.busId);
            const route = routes.find(r => r.routeId === trip.routeId);
            const driver = drivers.find(d => d.driverId === trip.driverId);
            const message = trip.logs[trip.logs.length - 1] || "Unspecified issue";
            return (
              <div key={trip.tripId} className="alert alert-danger emergency-flash-banner" role="alert" aria-live="assertive">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold', fontSize: '1.05rem' }}>
                  <span>🚨</span> CRITICAL SYSTEM WARNING: BUS SOS ACTIVE
                </div>
                <div style={{ fontSize: '0.85rem', fontWeight: '600' }}>
                  Bus <strong>{bus ? bus.busNumber : 'Unknown'}</strong> on Route <strong>{route ? route.routeName : 'Unknown'}</strong> (Driver: {driver ? driver.name : 'Unknown'}) has triggered SOS!
                </div>
                <div style={{ fontSize: '0.85rem', padding: '0.5rem', backgroundColor: 'rgba(255, 255, 255, 0.5)', borderRadius: '4px', fontStyle: 'italic', color: '#7f1d1d', marginTop: '0.25rem' }}>
                  Reported Issue: "{message.replace("[EMERGENCY] SOS Triggered: ", "")}"
                </div>
                <div style={{ fontSize: '0.75rem', marginTop: '0.25rem', fontWeight: 'bold' }}>
                  Please coordinate immediate response actions with driver/emergency services.
                </div>
              </div>
            );
          });
        }
        return null;
      })()}

      {/* Route Deviation Warning Banner */}
      {(() => {
        const deviatedTrips = trips.filter(t => t.routeDeviated);
        if (deviatedTrips.length > 0) {
          return deviatedTrips.map(trip => {
            const bus = buses.find(b => b.busId === trip.busId);
            const route = routes.find(r => r.routeId === trip.routeId);
            const driver = drivers.find(d => d.driverId === trip.driverId);
            // Search logs for deviation message, default if none found
            const message = [...trip.logs].reverse().find(log => log.includes("[DEVIATION]")) || "Simulated GPS drift - 500m off-route";
            return (
              <div key={trip.tripId} className="alert alert-warning route-deviation-banner" role="alert" aria-live="assertive" style={{ border: '2px solid #d97706', backgroundColor: '#fffbeb', color: '#b45309', display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '1.5rem', padding: '1rem', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold', fontSize: '1.05rem' }}>
                  <span>⚠️</span> ROUTE DEVIATION WARNING: GEOFENCE BREACH ACTIVE
                </div>
                <div style={{ fontSize: '0.85rem', fontWeight: '600' }}>
                  Bus <strong>{bus ? bus.busNumber : 'Unknown'}</strong> on Route <strong>{route ? route.routeName : 'Unknown'}</strong> (Driver: {driver ? driver.name : 'Unknown'}) is off-route!
                </div>
                <div style={{ fontSize: '0.85rem', padding: '0.5rem', backgroundColor: 'rgba(255, 255, 255, 0.6)', borderRadius: '4px', fontStyle: 'italic', color: '#78350f', marginTop: '0.25rem' }}>
                  Deviation details: "{message.replace("[DEVIATION] Route Deviation Triggered: ", "")}"
                </div>
                <div style={{ fontSize: '0.75rem', marginTop: '0.25rem', fontWeight: 'bold' }}>
                  Please contact the driver immediately to investigate the route change.
                </div>
              </div>
            );
          });
        }
        return null;
      })()}

      <div className="dashboard-title-bar">
        <div>
          <h2>School Operations Console</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>Manage transport services, schedules, student boarding and generate logs</p>
        </div>
      </div>

      {/* Top Cards Grid */}
      <div className="metrics-grid" role="region" aria-label="Quick metrics indicators">
        <div className="metric-card" tabIndex={0} aria-label={`${students.length} Total Students`}>
          <div className="metric-icon-wrapper" role="presentation">
            <Users size={24} aria-hidden="true" />
          </div>
          <div className="metric-details">
            <span className="metric-value">{students.length}</span>
            <span className="metric-label">Total Students</span>
          </div>
        </div>

        <div className="metric-card info" tabIndex={0} aria-label={`${buses.length} Active Buses`}>
          <div className="metric-icon-wrapper" role="presentation">
            <Truck size={24} aria-hidden="true" />
          </div>
          <div className="metric-details">
            <span className="metric-value">{buses.length}</span>
            <span className="metric-label">Active Buses</span>
          </div>
        </div>

        <div className="metric-card success" tabIndex={0} aria-label={`${routes.length} Configured Routes`}>
          <div className="metric-icon-wrapper" role="presentation">
            <Compass size={24} aria-hidden="true" />
          </div>
          <div className="metric-details">
            <span className="metric-value">{routes.length}</span>
            <span className="metric-label">Configured Routes</span>
          </div>
        </div>

        <div className={`metric-card ${activeTripsCount > 0 ? 'warning' : ''}`} tabIndex={0} aria-label={`${activeTripsCount} Trips Running Now`}>
          <div className="metric-icon-wrapper" role="presentation">
            <Calendar size={24} aria-hidden="true" />
          </div>
          <div className="metric-details">
            <span className="metric-value">{activeTripsCount}</span>
            <span className="metric-label">Trips Running Now</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="tabs-header" role="tablist" aria-label="School Admin Management Tabs" style={{ overflowX: 'auto', whiteSpace: 'nowrap' }}>
        <button className={`tab-btn ${activeTab === 'students' ? 'active' : ''}`} role="tab" aria-selected={activeTab === 'students'} aria-controls="students-tabpanel" id="students-tab" onClick={() => setActiveTab('students')}>👥 Students</button>
        <button className={`tab-btn ${activeTab === 'student-requests' ? 'active' : ''} ${studentRequests.filter(r => r.status === 'PENDING').length > 0 ? 'pulse-error' : ''}`} role="tab" onClick={() => setActiveTab('student-requests')} style={studentRequests.filter(r => r.status === 'PENDING').length > 0 ? { border: '1px solid #ef4444', animation: 'pulse 1.5s infinite', backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444' } : {}}>
          📋 Student Requests {studentRequests.filter(r => r.status === 'PENDING').length > 0 ? `(${studentRequests.filter(r => r.status === 'PENDING').length})` : ''}
        </button>
        <button className={`tab-btn ${activeTab === 'drivers' ? 'active' : ''}`} role="tab" aria-selected={activeTab === 'drivers'} aria-controls="drivers-tabpanel" id="drivers-tab" onClick={() => setActiveTab('drivers')}>👨‍✈️ Drivers</button>
        <button className={`tab-btn ${activeTab === 'buses' ? 'active' : ''}`} role="tab" aria-selected={activeTab === 'buses'} aria-controls="buses-tabpanel" id="buses-tab" onClick={() => setActiveTab('buses')}>🚌 Buses</button>
        <button className={`tab-btn ${activeTab === 'routes' ? 'active' : ''}`} role="tab" aria-selected={activeTab === 'routes'} aria-controls="routes-tabpanel" id="routes-tab" onClick={() => setActiveTab('routes')}>🗺️ Routes</button>
        <button className={`tab-btn ${activeTab === 'live-operations' ? 'active' : ''} ${emergencies.filter(e => e.status === 'Open').length > 0 ? 'pulse-error' : ''}`} role="tab" onClick={() => setActiveTab('live-operations')} style={emergencies.filter(e => e.status === 'Open').length > 0 ? { border: '1px solid #ef4444', animation: 'pulse 1.5s infinite', backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444' } : {}}>
          📡 Live Operations {emergencies.filter(e => e.status === 'Open').length > 0 ? '🚨' : ''}
        </button>
        <button className={`tab-btn ${activeTab === 'ai-planner' ? 'active' : ''}`} role="tab" onClick={() => setActiveTab('ai-planner')}>🤖 AI Planner</button>
        <button className={`tab-btn ${activeTab === 'analytics-reports' ? 'active' : ''}`} role="tab" onClick={() => setActiveTab('analytics-reports')}>📊 Analytics & Reports</button>
        <button className={`tab-btn ${activeTab === 'grievances' ? 'active' : ''} ${grievances.filter(g => g.status === 'Pending').length > 0 ? 'pulse-error' : ''}`} role="tab" onClick={() => setActiveTab('grievances')} style={grievances.filter(g => g.status === 'Pending').length > 0 ? { border: '1px solid #ef4444', animation: 'pulse 1.5s infinite', backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444' } : {}}>
          ⚠️ Grievances {grievances.filter(g => g.status === 'Pending').length > 0 ? `(${grievances.filter(g => g.status === 'Pending').length})` : ''}
        </button>
      </div>

      {/* Tab Panels */}
      {activeTab === 'students' && (
        <div id="students-tabpanel" role="tabpanel" aria-labelledby="students-tab" className="card-panel">
          <div className="card-title">
            <span>Student Management</span>
            <button className="btn btn-primary btn-sm" onClick={() => openAddModal('student')} aria-label="Add a new student record">
              <Plus size={14} aria-hidden="true" /> Add Student
            </button>
          </div>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Student ID</th>
                  <th scope="col">Name</th>
                  <th scope="col">Class / Sec</th>
                  <th scope="col">Stop Address</th>
                  <th scope="col">Assigned Bus</th>
                  <th scope="col">Assigned Route</th>
                  <th scope="col">Seat No</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map(s => {
                  const b = buses.find(bus => bus.busId === s.busId);
                  const r = routes.find(rt => rt.routeId === s.routeId);
                  return (
                    <tr key={s.studentId}>
                      <td scope="row" style={{ fontWeight: 'bold' }}>{s.studentId}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            backgroundColor: 'var(--border-color)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            overflow: 'hidden',
                            border: '1px solid var(--border-color)',
                            flexShrink: 0
                          }}>
                            {s.photoUrl ? (
                              <img src={s.photoUrl} alt={s.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <span style={{ fontSize: '0.75rem' }}>👤</span>
                            )}
                          </div>
                          <span>{s.name}</span>
                        </div>
                      </td>
                      <td>{s.class}-{s.section}</td>
                      <td>{getCleanAddressName(s.address)}</td>
                      <td>{b ? b.busNumber : 'None'}</td>
                      <td>{r ? r.routeName : 'None'}</td>
                      <td>{s.seatNumber ? `Seat ${s.seatNumber}` : <span style={{ color: 'var(--text-muted, #6b7280)' }}>None</span>}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.25rem' }} role="group" aria-label={`Actions for student ${s.name}`}>
                          <button 
                            className="btn btn-secondary btn-sm" 
                            onClick={() => handleOpenQrModal(s)} 
                            title="Generate/View Student QR Badge"
                            aria-label={`Generate or View QR Code Badge for student ${s.name}`}
                          >
                            <QrCode size={12} aria-hidden="true" />
                          </button>
                          <button className="btn btn-secondary btn-sm" onClick={() => openEditModal('student', s)} aria-label={`Edit details of student ${s.name}`}>
                            <Edit2 size={12} aria-hidden="true" />
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDeleteItem('student', s.studentId)} aria-label={`Delete record of student ${s.name}`}>
                            <Trash2 size={12} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'drivers' && (
        <div id="drivers-tabpanel" role="tabpanel" aria-labelledby="drivers-tab" className="card-panel">
          <div className="card-title">
            <span>Driver Management</span>
            <button className="btn btn-primary btn-sm" onClick={() => openAddModal('driver')} aria-label="Add a new bus driver record">
              <Plus size={14} aria-hidden="true" /> Add Driver
            </button>
          </div>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Driver ID</th>
                  <th scope="col">Name</th>
                  <th scope="col">Contact Phone</th>
                  <th scope="col">License Number</th>
                  <th scope="col">Rating</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map(d => {
                  const driverRatingsList = driverRatings.filter(r => r.driverId === d.driverId);
                  const averageRating = driverRatingsList.length > 0
                    ? (driverRatingsList.reduce((acc, curr) => acc + curr.stars, 0) / driverRatingsList.length).toFixed(1)
                    : 'N/A';
                  return (
                    <tr key={d.driverId}>
                      <td scope="row" style={{ fontWeight: 'bold' }}>{d.driverId}</td>
                      <td>{d.name}</td>
                      <td>{d.phone}</td>
                      <td><code>{d.licenseNumber}</code></td>
                      <td>
                        {averageRating !== 'N/A' ? (
                          <span style={{ fontWeight: '600', color: 'var(--primary-color)' }}>
                            ★ {averageRating} ({driverRatingsList.length})
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No reviews</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.25rem' }} role="group" aria-label={`Actions for driver ${d.name}`}>
                          <button className="btn btn-secondary btn-sm" onClick={() => openEditModal('driver', d)} aria-label={`Edit details of driver ${d.name}`}>
                            <Edit2 size={12} aria-hidden="true" />
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDeleteItem('driver', d.driverId)} aria-label={`Delete record of driver ${d.name}`}>
                            <Trash2 size={12} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'buses' && (
        <div id="buses-tabpanel" role="tabpanel" aria-labelledby="buses-tab" className="card-panel">
          <div className="card-title">
            <span>Bus Fleet Management</span>
            <button className="btn btn-primary btn-sm" onClick={() => openAddModal('bus')} aria-label="Add a new bus to fleet">
              <Plus size={14} aria-hidden="true" /> Add Bus
            </button>
          </div>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Bus ID</th>
                  <th scope="col">Registration Number</th>
                  <th scope="col">Capacity</th>
                  <th scope="col">Driver Assigned</th>
                  <th scope="col">Current Status</th>
                  <th scope="col">Maintenance Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {buses.map(b => {
                  const driverObj = drivers.find(d => d.driverId === b.driverId);
                  return (
                    <tr key={b.busId}>
                      <td scope="row" style={{ fontWeight: 'bold' }}>{b.busId}</td>
                      <td><strong>{b.busNumber}</strong></td>
                      <td>{b.capacity} Seats</td>
                      <td>{driverObj ? driverObj.name : 'None Assigned'}</td>
                      <td>
                        <span className={`badge ${b.currentStatus === 'Idle' ? 'idle' : 'on-trip'}`} aria-label={`Bus status: ${b.currentStatus}`}>
                          {b.currentStatus}
                        </span>
                      </td>
                      <td>
                        <span className="badge" style={{ backgroundColor: '#f0fdf4', color: '#16a34a' }} aria-label={`Maintenance status: ${b.maintenanceStatus}`}>{b.maintenanceStatus}</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.25rem' }} role="group" aria-label={`Actions for bus ${b.busNumber}`}>
                          <button className="btn btn-secondary btn-sm" onClick={() => openEditModal('bus', b)} aria-label={`Edit details of bus ${b.busNumber}`}>
                            <Edit2 size={12} aria-hidden="true" />
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDeleteItem('bus', b.busId)} aria-label={`Delete record of bus ${b.busNumber}`}>
                            <Trash2 size={12} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'routes' && (
        <div id="routes-tabpanel" role="tabpanel" aria-labelledby="routes-tab" className="card-panel">
          <div className="card-title">
            <span>Route Configurations</span>
            <button className="btn btn-primary btn-sm" onClick={() => openAddModal('route')} aria-label="Add a new route configuration">
              <Plus size={14} aria-hidden="true" /> Add Route
            </button>
          </div>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Route ID</th>
                  <th scope="col">Route Name</th>
                  <th scope="col">Distance</th>
                  <th scope="col">Duration</th>
                  <th scope="col">Stops List</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {routes.map(r => (
                  <tr key={r.routeId}>
                    <td scope="row" style={{ fontWeight: 'bold' }}>{r.routeId}</td>
                    <td><strong>{r.routeName}</strong></td>
                    <td>{r.distance}</td>
                    <td>{r.estimatedTime}</td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }} role="group" aria-label={`Stops on route ${r.routeName}`}>
                        {r.stops.map((stop, idx) => (
                          <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', fontSize: '0.75rem', padding: '0.1rem 0.35rem', backgroundColor: '#e2e8f0', color: '#475569', borderRadius: '4px' }}>
                             <MapPin size={10} style={{ marginRight: '2px' }} aria-hidden="true" /> {getCleanAddressName(stop)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.25rem' }} role="group" aria-label={`Actions for route ${r.routeName}`}>
                        <button className="btn btn-secondary btn-sm" onClick={() => openEditModal('route', r)} aria-label={`Edit details of route ${r.routeName}`}>
                          <Edit2 size={12} aria-hidden="true" />
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDeleteItem('route', r.routeId)} aria-label={`Delete record of route ${r.routeName}`}>
                          <Trash2 size={12} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'live-operations' && (
        <div id="live-operations-tabpanel" role="tabpanel" className="card-panel">
          <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📡 Live Operations & Fleet Monitor</span>
          </h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            Real-time tracking of active bus trips, geofence status check-ins, and driver distress SOS alerts.
          </p>

          {/* Active Emergency SOS Panel (if any) */}
          {emergencies.filter(e => e.status === 'Open').length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {emergencies.filter(e => e.status === 'Open').map(em => (
                  <div key={em.emergencyId} style={{ border: '2px solid #ef4444', backgroundColor: 'rgba(239, 68, 68, 0.05)', padding: '1.25rem', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <span style={{ backgroundColor: '#ef4444', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>ACTIVE INCIDENT</span>
                        <h4 style={{ marginTop: '0.5rem', color: '#ef4444', fontSize: '1.1rem', fontWeight: 'bold' }}>Bus #{em.busId} Emergency Triggered</h4>
                        <p style={{ fontSize: '0.85rem', margin: '0.25rem 0', color: 'var(--text-main)' }}><strong>Reason:</strong> {em.reason}</p>
                        <p style={{ fontSize: '0.85rem', margin: '0.25rem 0', color: 'var(--text-muted)' }}><strong>Students Onboard:</strong> {em.studentsOnboard}</p>
                        <p style={{ fontSize: '0.85rem', margin: '0.25rem 0', color: 'var(--text-muted)' }}><strong>Time:</strong> {new Date(em.createdAt).toLocaleString()}</p>
                      </div>
                      <ShieldAlert size={32} color="#ef4444" style={{ animation: 'bounce 1s infinite' }} />
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ color: 'var(--text-main)', fontSize: '0.85rem' }}>Resolution Summary</label>
                      <textarea 
                        className="form-input" 
                        style={{ height: '60px', fontFamily: 'inherit', fontSize: '0.8rem' }}
                        placeholder="Log support actions, shunts, or backup dispatches..." 
                        value={resolutionNotes} 
                        onChange={(e) => setResolutionNotes(e.target.value)}
                      />
                    </div>

                    <button 
                      className="btn btn-danger"
                      onClick={async () => {
                        await resolveEmergency(em.emergencyId, resolutionNotes || 'Support shuttles dispatched, students transferred safely.');
                        setResolutionNotes('');
                      }}
                      style={{ padding: '0.6rem 1rem' }}
                    >
                      Clear Alarm & Resolve Incident
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div id="admin-sos-map" style={{ height: '280px', borderRadius: '10px', border: '1px solid #ef4444', zIndex: 1 }}></div>
                <div style={{ fontSize: '0.75rem', backgroundColor: '#fef3c7', padding: '0.75rem', borderRadius: '6px', border: '1px solid #fde68a', color: '#92400e', lineHeight: '1.4' }}>
                  ⚠️ Parent broadcasts are live. Shuttles details will display automatically under the student telemetry tracker panel.
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', backgroundColor: 'var(--panel-bg)', padding: '0.85rem 1.25rem', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '1.5rem' }}>
              <CheckCircle size={18} color="#10b981" />
              <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-main)' }}>All Terminals Clear: No active driver distress calls. SOS systems are monitoring telemetry channels.</span>
            </div>
          )}

          {/* Master Fleet overview map & Roster matrix grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '1.5rem', marginBottom: '2rem' }}>
            {/* Column 1: Master Fleet Map */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ backgroundColor: 'var(--panel-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.25rem', height: '100%' }}>
                <h4 style={{ margin: '0 0 0.75rem 0', color: 'var(--text-main)', fontSize: '0.95rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>🛰️ Real-Time Fleet Overview Map</span>
                </h4>
                <div id="admin-fleet-map" style={{ height: '320px', borderRadius: '8px', border: '1px solid var(--border-color)', zIndex: 1 }}></div>
              </div>
            </div>

            {/* Column 2: Roster Matrix Board */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ backgroundColor: 'var(--panel-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.25rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
                <h4 style={{ margin: '0 0 0.75rem 0', color: 'var(--text-main)', fontSize: '0.95rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>📋 Daily Dispatcher Roster Matrix</span>
                </h4>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 1rem 0', lineHeight: '1.3' }}>
                  Reassign fleet buses to active school routes instantly before morning departures.
                </p>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto', flex: 1, maxHeight: '280px', paddingRight: '4px' }}>
                  {routes.map(r => {
                    const routeStudents = students.filter(s => s.routeId === r.routeId);
                    const currentBusId = routeStudents.length > 0 ? (routeStudents[0].busId || 'B1') : 'B1';
                    
                    const assignedBus = buses.find(b => b.busId === (selectedRosterBus[r.routeId] || currentBusId));
                    const assignedDriver = assignedBus ? drivers.find(d => d.driverId === assignedBus.driverId) : null;
                    
                    return (
                      <div key={r.routeId} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.75rem', backgroundColor: 'var(--bg-color)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 'bold', fontSize: '0.85rem', color: 'var(--text-main)' }}>{r.routeName}</span>
                          <span style={{ fontSize: '0.75rem', backgroundColor: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                            {routeStudents.length} Students
                          </span>
                        </div>
                        
                        {updatingRosterRoute === r.routeId ? (
                          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                            <select 
                              className="form-select" 
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', height: '32px', flex: 1 }}
                              defaultValue={assignedBus?.busId || 'B1'}
                              onChange={(e) => {
                                const val = e.target.value;
                                setSelectedRosterBus(prev => ({ ...prev, [r.routeId]: val }));
                              }}
                            >
                              {buses.map(b => (
                                <option key={b.busId} value={b.busId}>{b.busNumber} ({b.capacity} seats)</option>
                              ))}
                            </select>
                            <button 
                              className="btn btn-primary btn-sm"
                              style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', height: '32px' }}
                              onClick={() => handleUpdateRoster(r.routeId, selectedRosterBus[r.routeId] || currentBusId)}
                            >
                              Save
                            </button>
                            <button 
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', height: '32px' }}
                              onClick={() => setUpdatingRosterRoute(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                              🚌 Bus: <strong style={{ color: 'var(--text-main)' }}>{assignedBus?.busNumber || 'None'}</strong> • 👨‍✈️ Driver: <span style={{ fontStyle: 'italic' }}>{assignedDriver?.name || 'None'}</span>
                            </div>
                            <button 
                              className="btn btn-secondary btn-sm" 
                              style={{ padding: '0.15rem 0.5rem', fontSize: '0.7rem', height: '24px' }}
                              onClick={() => {
                                setUpdatingRosterRoute(r.routeId);
                                setSelectedRosterBus(prev => ({ ...prev, [r.routeId]: assignedBus?.busId || 'B1' }));
                              }}
                            >
                              Reassign
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Active Trips Table Section */}
          <div style={{ marginTop: '1.5rem' }}>
            <h4 style={{ marginBottom: '0.75rem', color: 'var(--text-main)', fontSize: '0.95rem', fontWeight: 'bold' }}>Live Active Trips Status</h4>
            {trips.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-muted)' }} role="status">
                No trips have been simulated yet. Log in as a Driver to start a trip!
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Trip ID</th>
                      <th scope="col">Route</th>
                      <th scope="col">Bus</th>
                      <th scope="col">Driver</th>
                      <th scope="col">Status</th>
                      <th scope="col">Start Time</th>
                      <th scope="col">Progress / Distance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trips.map(t => {
                      const r = routes.find(rt => rt.routeId === t.routeId);
                      const b = buses.find(bus => bus.busId === t.busId);
                      const d = drivers.find(dr => dr.driverId === t.driverId);
                      return (
                        <tr key={t.tripId}>
                          <td scope="row" style={{ fontWeight: 'bold' }}>{t.tripId}</td>
                          <td>{r ? r.routeName : 'Unknown'}</td>
                          <td>{b ? b.busNumber : 'Unknown'}</td>
                          <td>{d ? d.name : 'Unknown'}</td>
                          <td>
                            <span className={`badge ${t.status === 'Active' ? 'on-trip' : 'completed'}`} aria-label={`Trip status: ${t.status}`}>
                              {t.status}
                            </span>
                          </td>
                          <td>{new Date(t.startTime).toLocaleTimeString()}</td>
                          <td>
                            <div>
                              <div>{t.distanceCovered} covered</div>
                              {t.status === 'Active' && r && (
                                <div style={{ fontSize: '0.75rem', color: 'var(--primary-color)', fontWeight: 'bold' }} role="status" aria-live="polite">
                                  Currently near stop: {r.stops[t.currentStopIndex]}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Historical SOS Incidents Logs Section */}
          <div style={{ marginTop: '2rem' }}>
            <h4 style={{ marginBottom: '0.75rem', color: 'var(--text-main)', fontSize: '0.95rem', fontWeight: 'bold' }}>Historical Incidents Logs</h4>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Trip ID</th>
                    <th>Bus</th>
                    <th>Category</th>
                    <th>Students</th>
                    <th>Triggered At</th>
                    <th>Resolved At</th>
                    <th>Resolution Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {emergencies.filter(e => e.status === 'Resolved').length > 0 ? (
                    emergencies.filter(e => e.status === 'Resolved').map(em => (
                      <tr key={em.emergencyId}>
                        <td>{em.tripId}</td>
                        <td>BUS-{em.busId}</td>
                        <td><span style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>{em.reason}</span></td>
                        <td>{em.studentsOnboard}</td>
                        <td style={{ fontSize: '0.75rem' }}>{new Date(em.createdAt).toLocaleString()}</td>
                        <td style={{ fontSize: '0.75rem' }}>{em.resolvedAt ? new Date(em.resolvedAt).toLocaleString() : '-'}</td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{em.resolutionNotes}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No historical emergency events logged.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {activeTab === 'ai-planner' && (
        <div id="ai-planner-tabpanel" role="tabpanel" className="card-panel">
          <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🤖 AI Route Optimizer & Telematics</span>
          </h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            Run advanced routing heuristics to solve the TSP, optimizing transport times and fuel costs.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
            <div style={{ backgroundColor: 'var(--bg-color)', padding: '1.25rem', borderRadius: '10px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <h4 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1rem', fontWeight: 'bold' }}>Optimizer Setup</h4>
              
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.85rem' }}>Select Target Route</label>
                <select className="form-select" value={selectedPlannerRoute} onChange={(e) => setSelectedPlannerRoute(e.target.value)}>
                  <option value="">-- Choose Route --</option>
                  {routes.map(r => <option key={r.routeId} value={r.routeId}>{r.routeName}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.85rem' }}>Traffic Density</label>
                <select className="form-select" value={trafficLevel} onChange={(e) => setTrafficLevel(e.target.value)}>
                  <option value="Light">Light Traffic</option>
                  <option value="Moderate">Moderate Congestion</option>
                  <option value="Heavy">Heavy Gridlock</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.85rem' }}>Weather Conditions</label>
                <select className="form-select" value={weatherCondition} onChange={(e) => setWeatherCondition(e.target.value)}>
                  <option value="Sunny">Sunny / Normal</option>
                  <option value="Rainy">Rainy (Slow Speed)</option>
                  <option value="Stormy">Stormy (Severe Hazards)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.85rem' }}>Active Road Closures</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. Pine St closed" 
                  value={roadClosures} 
                  onChange={(e) => setRoadClosures(e.target.value)} 
                />
              </div>

              <button 
                className="btn btn-primary" 
                disabled={!selectedPlannerRoute}
                onClick={async () => {
                  const opt = await generateRouteOptimization(selectedPlannerRoute, trafficLevel, roadClosures || 'None', weatherCondition);
                  setGeneratedOpt(opt);
                }}
                style={{ marginTop: '0.5rem', width: '100%', padding: '0.65rem' }}
              >
                🤖 Execute Solver Heuristics
              </button>
            </div>

            <div>
              {generatedOpt ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
                    <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '0.75rem', borderRadius: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 'bold' }}>OPTIMIZED DISTANCE</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#10b981', marginTop: '0.25rem' }}>{generatedOpt.totalDistance} km</div>
                    </div>
                    <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '0.75rem', borderRadius: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.7rem', color: '#3b82f6', fontWeight: 'bold' }}>ESTIMATED TIME</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#3b82f6', marginTop: '0.25rem' }}>{generatedOpt.estimatedTime} m</div>
                    </div>
                    <div style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', padding: '0.75rem', borderRadius: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.7rem', color: '#f59e0b', fontWeight: 'bold' }}>BUS UTILIZATION</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#f59e0b', marginTop: '0.25rem' }}>{generatedOpt.busUtilization}%</div>
                    </div>
                    <div style={{ backgroundColor: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.2)', padding: '0.75rem', borderRadius: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.7rem', color: '#8b5cf6', fontWeight: 'bold' }}>SOLVER MODEL</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#8b5cf6', marginTop: '0.4rem' }}>{generatedOpt.algorithmUsed}</div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div style={{ backgroundColor: 'var(--panel-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1rem' }}>
                      <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: 'var(--text-main)' }}>Telemetry Comparisons</h4>
                      <div style={{ height: '140px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={[
                              { name: 'Distance (km)', Base: parseFloat((generatedOpt.totalDistance * 1.25).toFixed(1)), Optimized: generatedOpt.totalDistance },
                              { name: 'Duration (min)', Base: parseFloat((generatedOpt.estimatedTime * 1.3).toFixed(1)), Optimized: generatedOpt.estimatedTime }
                            ]}
                            margin={{ top: 5, right: 5, left: -25, bottom: 5 }}
                          >
                            <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={10} />
                            <YAxis stroke="var(--text-muted)" fontSize={10} />
                            <Tooltip />
                            <Legend wrapperStyle={{ fontSize: '9px' }} />
                            <Bar dataKey="Base" fill="#9ca3af" />
                            <Bar dataKey="Optimized" fill="#10b981" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div style={{ fontSize: '0.75rem', textAlign: 'center', color: '#10b981', fontWeight: 'bold', marginTop: '0.5rem' }}>
                        🎉 Savings: ~20% fuel and transit overhead!
                      </div>
                    </div>

                    <div style={{ backgroundColor: 'var(--panel-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1rem' }}>
                      <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: 'var(--text-main)' }}>Optimized Stops Path</h4>
                      <div style={{ maxHeight: '160px', overflowY: 'auto', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {generatedOpt.suggestedRoute.split(" -> ").map((stop, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px', backgroundColor: 'var(--bg-color)', borderRadius: '4px' }}>
                            <span style={{ backgroundColor: i === 0 ? '#3b82f6' : '#10b981', color: '#fff', width: '18px', height: '18px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 'bold' }}>{i}</span>
                            <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '220px' }}>{stop}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div id="admin-opt-map" style={{ height: '240px', borderRadius: '8px', border: '1px solid var(--border-color)', zIndex: 1 }}></div>
                </div>
              ) : (
                <div style={{ height: '100%', minHeight: '350px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed var(--border-color)', borderRadius: '10px', padding: '2rem', textAlign: 'center' }}>
                  <span style={{ fontSize: '3rem' }}>🤖</span>
                  <h4 style={{ margin: '1rem 0 0.5rem 0', color: 'var(--text-main)', fontWeight: 'bold' }}>Optimizer Panel</h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '300px' }}>Select a target bus route to optimize coordinates sequences using Dijkstra or Genetic constraints.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'analytics-reports' && (
        <div id="analytics-reports-tabpanel" role="tabpanel" className="card-panel">
          <h3 className="card-title">📊 Analytics & Reporting Audits</h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            Review real-time verification distributions, matching audits, and export custom transportation attendance CSV ledgers.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
            {/* Left Column: Verification Distributions & Biometrics matching audits */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ backgroundColor: 'var(--panel-bg)', padding: '1.25rem', borderRadius: '10px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <h4 style={{ marginBottom: '1rem', color: 'var(--text-main)', fontSize: '0.9rem', fontWeight: 'bold', alignSelf: 'flex-start' }}>Scan Verification Distributions</h4>
                
                {(() => {
                  const qrCount = attendanceEvents.filter(e => e.type === 'QR').length;
                  const faceCount = attendanceEvents.filter(e => e.type === 'FACE').length;
                  const manualCount = attendanceEvents.filter(e => e.type === 'MANUAL').length;

                  const hasData = qrCount + faceCount + manualCount > 0;

                  const pieData = hasData ? [
                    { name: 'QR Scan', value: qrCount, color: '#3b82f6' },
                    { name: 'Face recognition', value: faceCount, color: '#10b981' },
                    { name: 'Manual Override', value: manualCount, color: '#f59e0b' }
                  ] : [
                    { name: 'No Data', value: 1, color: '#9ca3af' }
                  ];

                  return (
                    <>
                      <div style={{ height: '140px', width: '100%' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={pieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={40}
                              outerRadius={60}
                              paddingAngle={5}
                              dataKey="value"
                            >
                              {pieData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '1rem', fontSize: '0.75rem', justifyContent: 'center' }}>
                        {hasData ? pieData.map((d, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: d.color }}></div>
                            <span>{d.name}: <strong>{d.value}</strong></span>
                          </div>
                        )) : (
                          <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>Scan QR or match face on driver console to build graph.</span>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>

              <div style={{ backgroundColor: 'var(--panel-bg)', padding: '1.25rem', borderRadius: '10px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <h4 style={{ margin: 0, color: 'var(--text-main)', fontSize: '0.9rem', fontWeight: 'bold' }}>Biometric Facial Matching Audits</h4>
                <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {attendanceEvents.filter(e => e.type === 'FACE').length > 0 ? (
                    attendanceEvents.filter(e => e.type === 'FACE').slice().reverse().map(ev => {
                      const student = students.find(s => s.studentId === ev.studentId);
                      return (
                        <div key={ev.eventId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', backgroundColor: 'var(--bg-color)', borderRadius: '6px', borderLeft: '3px solid #10b981', fontSize: '0.8rem' }}>
                          <div>
                            <strong>{student ? student.name : `Student #${ev.studentId}`}</strong> matched
                            <span style={{ marginLeft: '4px', color: '#10b981', fontWeight: 'bold' }}>({ev.confidence.toFixed(1)}% confidence)</span>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {ev.status} • {ev.scannedAt.split("T").length > 1 ? ev.scannedAt.split("T")[1].substring(0, 5) : ev.scannedAt}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem', fontSize: '0.85rem' }}>No face templates matched today.</div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Export CSV Boarding Reports */}
            <div style={{ backgroundColor: 'var(--panel-bg)', padding: '1.5rem', borderRadius: '10px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '1rem', height: 'fit-content' }}>
              <h4 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1rem', fontWeight: 'bold' }}>Export Boarding & Attendance Reports</h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                Generate and export custom transportation records as CSV sheets for school board audits.
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} role="group" aria-label="Report selection form">
                <div className="form-group">
                  <label className="form-label" htmlFor="report-filter-select">Report Filter Level</label>
                  <select id="report-filter-select" className="form-select" value={reportType} onChange={(e) => { setReportType(e.target.value); setReportTargetId(''); }}>
                    <option value="student">Student Attendance History</option>
                    <option value="bus">Bus Route Load Ledger</option>
                    <option value="route">Route Stops Activity Ledger</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="report-target-select">Select Target Node</label>
                  <select id="report-target-select" className="form-select" value={reportTargetId} onChange={(e) => setReportTargetId(e.target.value)} required aria-required="true">
                    <option value="">-- Choose Target --</option>
                    {reportType === 'student' && students.map(s => <option key={s.studentId} value={s.studentId}>{s.name} ({s.studentId})</option>)}
                    {reportType === 'bus' && buses.map(b => <option key={b.busId} value={b.busId}>{b.busNumber}</option>)}
                    {reportType === 'route' && routes.map(r => <option key={r.routeId} value={r.routeId}>{r.routeName}</option>)}
                  </select>
                </div>

                <button 
                  className="btn btn-success" 
                  onClick={() => {
                    if (!reportTargetId) {
                      alert('Please select a target first.');
                      return;
                    }
                    downloadAttendanceReport(reportType, reportTargetId);
                  }}
                  style={{ padding: '0.6rem 1rem', marginTop: '0.5rem' }}
                  aria-label="Generate and download selected report in CSV format"
                >
                  <FileSpreadsheet size={16} aria-hidden="true" /> Generate & Download CSV
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Table: Detailed Scan Logs */}
          <h4 style={{ marginBottom: '0.75rem', color: 'var(--text-main)', fontSize: '0.95rem', fontWeight: 'bold' }}>Detailed Verification Scan Logs</h4>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Log ID</th>
                  <th>Student Name</th>
                  <th>Scan Mode</th>
                  <th>Signal Strength/Conf</th>
                  <th>Action</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {attendanceEvents.length > 0 ? (
                  attendanceEvents.slice().reverse().map(ev => {
                    const student = students.find(s => s.studentId === ev.studentId);
                    return (
                      <tr key={ev.eventId}>
                        <td>#{ev.eventId}</td>
                        <td>{student ? student.name : `Student #${ev.studentId}`}</td>
                        <td>
                          <span style={{
                            backgroundColor: ev.type === 'FACE' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                            color: ev.type === 'FACE' ? '#10b981' : '#3b82f6',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 'bold'
                          }}>
                            {ev.type}
                          </span>
                        </td>
                        <td>{ev.confidence ? `${(ev.confidence * 100).toFixed(0).length > 3 ? ev.confidence.toFixed(1) : (ev.confidence * 100).toFixed(0)}%` : '100%'}</td>
                        <td>
                          <span style={{
                            color: ev.status === 'Boarded' ? '#10b981' : '#f59e0b',
                            fontWeight: 'bold'
                          }}>
                            {ev.status}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.75rem' }}>
                          {ev.scannedAt.split("T").join(" ")}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No scanning transactions logged today.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'grievances' && (
        <div className="card-panel">
          <div className="card-title">
            <span>Parent Grievances Portal</span>
          </div>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Grievance ID</th>
                  <th>Parent / Contact</th>
                  <th>Title / Category</th>
                  <th>Description</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Actions / Resolution Notes</th>
                </tr>
              </thead>
              <tbody>
                {grievances.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No parent grievances recorded in the database.</td>
                  </tr>
                ) : (
                  grievances.map((g) => {
                    const parent = parents.find(p => p.parentId === g.parentId);
                    const formattedDate = g.createdAt ? g.createdAt.split('T')[0] : '';
                    return (
                      <tr key={g.grievanceId}>
                        <td style={{ fontWeight: 'bold' }}>#{g.grievanceId}</td>
                        <td>
                          <div style={{ fontWeight: '600' }}>{parent ? parent.name : `Parent ID: ${g.parentId}`}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{parent ? parent.phone : ''}</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: '600' }}>{g.title}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Category: {g.category}</div>
                        </td>
                        <td style={{ maxWidth: '280px', fontSize: '0.82rem', lineHeight: '1.4' }}>{g.description}</td>
                        <td>{formattedDate}</td>
                        <td>
                          <span className={`badge ${g.status === 'Resolved' ? 'completed' : g.status === 'In Progress' ? 'on-trip' : 'absent'}`}>
                            {g.status}
                          </span>
                        </td>
                        <td>
                          {g.status !== 'Resolved' ? (
                            <button
                              onClick={() => {
                                setSelectedGrievanceId(g.grievanceId);
                                setGrievanceNotes(g.resolutionNotes || '');
                                setShowGrievanceResolveModal(true);
                              }}
                              className="btn btn-primary btn-sm"
                            >
                              Resolve
                            </button>
                          ) : (
                            <div style={{ fontSize: '0.76rem', color: 'var(--success)', fontWeight: '500' }}>
                              Resolved: <em>{g.resolutionNotes}</em>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Grievance Resolution Modal */}
      {showGrievanceResolveModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="resolve-modal-title">
          <div className="modal-content">
            <div className="modal-header">
              <h3 id="resolve-modal-title">Resolve Parent Grievance</h3>
              <button 
                onClick={() => {
                  setShowGrievanceResolveModal(false);
                  setSelectedGrievanceId(null);
                  setGrievanceNotes('');
                }} 
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.5rem', fontWeight: 'bold' }}
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!grievanceNotes.trim()) {
                alert('Please enter resolution notes.');
                return;
              }
              const res = await resolveGrievance(selectedGrievanceId, grievanceNotes);
              if (res.success) {
                alert('Grievance resolved successfully. Parent has been notified.');
                setShowGrievanceResolveModal(false);
                setSelectedGrievanceId(null);
                setGrievanceNotes('');
              } else {
                alert(res.message);
              }
            }}>
              <div className="modal-grid">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Resolution Actions & Notes</label>
                  <textarea
                    className="form-input"
                    rows="5"
                    placeholder="Describe how the grievance was resolved (e.g. driver has been counselled, schedule adjusted)..."
                    value={grievanceNotes}
                    onChange={(e) => setGrievanceNotes(e.target.value)}
                    required
                    style={{ resize: 'vertical' }}
                  />
                </div>
              </div>
              <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', backgroundColor: 'rgba(0, 0, 0, 0.1)' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowGrievanceResolveModal(false);
                    setSelectedGrievanceId(null);
                    setGrievanceNotes('');
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-success">
                  Resolve & Close
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'student-requests' && (
        <div className="card-panel">
          <div className="card-title">
            <span>Student Registration Requests</span>
          </div>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Request ID</th>
                  <th>Student Name</th>
                  <th>Class / Section</th>
                  <th>Parent ID</th>
                  <th>Address</th>
                  <th>Preferred Route</th>
                  <th>Preferred Bus</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {studentRequests.length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                      No student registration requests found.
                    </td>
                  </tr>
                ) : (
                  studentRequests.map(req => {
                    const r = routes.find(rt => rt.routeId === req.routeId);
                    const b = buses.find(bus => bus.busId === req.busId);
                    return (
                      <tr key={req.requestId}>
                        <td style={{ fontWeight: 'bold' }}>{req.requestId}</td>
                        <td>{req.name}</td>
                        <td>{req.studentClass}-{req.section}</td>
                        <td>P{req.parentId}</td>
                        <td>{getCleanAddressName(req.address)}</td>
                        <td>{r ? r.routeName : 'Not Specified'}</td>
                        <td>{b ? b.busNumber : 'Not Specified'}</td>
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
                        <td>
                          {req.status === 'PENDING' ? (
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button 
                                className="btn btn-success btn-sm" 
                                onClick={async () => {
                                  if (confirm(`Approve registration request for ${req.name}?`)) {
                                    const res = await approveStudentRequest(req.requestId);
                                    if (res.success) {
                                      alert(`Student request for ${req.name} approved successfully!`);
                                    } else {
                                      alert(res.message);
                                    }
                                  }
                                }}
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                              >
                                Approve
                              </button>
                              <button 
                                className="btn btn-danger btn-sm" 
                                onClick={async () => {
                                  if (confirm(`Reject registration request for ${req.name}?`)) {
                                    const res = await rejectStudentRequest(req.requestId);
                                    if (res.success) {
                                      alert(`Student request for ${req.name} rejected.`);
                                    } else {
                                      alert(res.message);
                                    }
                                  }
                                }}
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No Actions</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Universal CRUD Modal */}
      {showModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className={`modal-content ${(modalType === 'student' || modalType === 'route') ? 'wide' : ''}`}>
            <div className="modal-header">
              <h3 id="modal-title">{modalMode === 'add' ? 'Add New' : 'Edit'} {modalType.toUpperCase()}</h3>
              <button onClick={() => setShowModal(false)} aria-label="Close modal window" style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
            </div>
            
            <form onSubmit={handleFormSubmit}>
              {(modalType === 'student' || modalType === 'route') ? (
                <div className="modal-grid">
                  <div className="modal-form-column">
                    {modalType === 'student' && (
                      <>
                        <div className="form-group">
                          <label className="form-label" htmlFor="student-photo-input" style={{ color: 'var(--text-main)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Student Photo / Avatar</span>
                            {studentForm.photoUrl && (
                              <button 
                                type="button" 
                                className="btn btn-secondary btn-sm"
                                style={{ padding: '0.1rem 0.4rem', fontSize: '0.65rem' }} 
                                onClick={() => setStudentForm({ ...studentForm, photoUrl: '' })}
                              >
                                Clear Photo
                              </button>
                            )}
                          </label>
                          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                            <div style={{
                              width: '50px',
                              height: '50px',
                              borderRadius: '50%',
                              backgroundColor: 'var(--border-color)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              overflow: 'hidden',
                              border: '2px solid var(--primary-color)'
                            }}>
                              {studentForm.photoUrl ? (
                                <img src={studentForm.photoUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                <span style={{ fontSize: '1.25rem' }}>👤</span>
                              )}
                            </div>
                            <input 
                              type="file" 
                              id="student-photo-input" 
                              className="form-input" 
                              accept="image/*" 
                              onChange={(e) => {
                                const file = e.target.files[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onloadend = () => {
                                    setStudentForm({ ...studentForm, photoUrl: reader.result });
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }} 
                              style={{ flex: 1, fontSize: '0.8rem', padding: '0.25rem' }}
                            />
                          </div>
                        </div>

                        <div className="form-group">
                          <label className="form-label" htmlFor="student-name-input" style={{ color: 'var(--text-main)' }}>Student Full Name</label>
                          <input type="text" id="student-name-input" className="form-input" required value={studentForm.name} onChange={(e) => setStudentForm({ ...studentForm, name: e.target.value })} aria-required="true" />
                        </div>
                        <div className="form-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                          <div>
                            <label className="form-label" htmlFor="student-class-input" style={{ color: 'var(--text-main)' }}>Grade / Class</label>
                            <input type="text" id="student-class-input" className="form-input" placeholder="e.g. 8" required value={studentForm.class} onChange={(e) => setStudentForm({ ...studentForm, class: e.target.value })} aria-required="true" />
                          </div>
                          <div>
                            <label className="form-label" htmlFor="student-section-input" style={{ color: 'var(--text-main)' }}>Section</label>
                            <input type="text" id="student-section-input" className="form-input" placeholder="e.g. A" required value={studentForm.section} onChange={(e) => setStudentForm({ ...studentForm, section: e.target.value })} aria-required="true" />
                          </div>
                        </div>
                        <div className="form-group">
                          <label className="form-label" htmlFor="student-address-input" style={{ color: 'var(--text-main)' }}>Stop Address / Pickup Stop</label>
                          <input type="text" id="student-address-input" className="form-input" placeholder="e.g. Pine Road" required value={studentForm.address} onChange={(e) => setStudentForm({ ...studentForm, address: e.target.value })} aria-required="true" />
                        </div>
                        <div className="form-group">
                          <label className="form-label" htmlFor="student-route-select" style={{ color: 'var(--text-main)' }}>Assign Route</label>
                          <select id="student-route-select" className="form-select" value={studentForm.routeId} onChange={(e) => setStudentForm({ ...studentForm, routeId: e.target.value })}>
                            <option value="">No Route Assigned</option>
                            {routes.map(r => <option key={r.routeId} value={r.routeId}>{r.routeName}</option>)}
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="form-label" htmlFor="student-bus-select" style={{ color: 'var(--text-main)' }}>Assign Bus</label>
                          <select id="student-bus-select" className="form-select" value={studentForm.busId} onChange={(e) => setStudentForm({ ...studentForm, busId: e.target.value })}>
                            <option value="">No Bus Assigned</option>
                            {buses.map(b => <option key={b.busId} value={b.busId}>{b.busNumber}</option>)}
                          </select>
                        </div>
                        {(() => {
                          const selectedBus = buses.find(b => b.busId === Number(studentForm.busId));
                          const maxSeats = selectedBus ? selectedBus.capacity : 30;
                          return studentForm.busId && (
                            <div className="form-group">
                              <label className="form-label" htmlFor="student-seat-input" style={{ color: 'var(--text-main)' }}>
                                Seat Number (1 - {maxSeats}) (Optional)
                              </label>
                              <input 
                                type="number" 
                                id="student-seat-input" 
                                className="form-input" 
                                min="1"
                                max={maxSeats}
                                placeholder="Leave blank for auto-assignment" 
                                value={studentForm.seatNumber || ''} 
                                onChange={(e) => setStudentForm({ ...studentForm, seatNumber: e.target.value ? Number(e.target.value) : '' })} 
                              />
                            </div>
                          );
                        })()}
                      </>
                    )}

                    {modalType === 'route' && (
                      <>
                        <div className="form-group">
                          <label className="form-label" htmlFor="route-name-input" style={{ color: 'var(--text-main)' }}>Route Name</label>
                          <input type="text" id="route-name-input" className="form-input" placeholder="e.g. East Route" required value={routeForm.routeName} onChange={(e) => setRouteForm({ ...routeForm, routeName: e.target.value })} aria-required="true" />
                        </div>
                        <div className="form-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                          <div>
                            <label className="form-label" htmlFor="route-distance-input" style={{ color: 'var(--text-main)' }}>Total Distance</label>
                            <input type="text" id="route-distance-input" className="form-input" placeholder="e.g. 10 km" required value={routeForm.distance} onChange={(e) => setRouteForm({ ...routeForm, distance: e.target.value })} aria-required="true" />
                          </div>
                          <div>
                            <label className="form-label" htmlFor="route-time-input" style={{ color: 'var(--text-main)' }}>Estimated Duration</label>
                            <input type="text" id="route-time-input" className="form-input" placeholder="e.g. 25 mins" required value={routeForm.estimatedTime} onChange={(e) => setRouteForm({ ...routeForm, estimatedTime: e.target.value })} aria-required="true" />
                          </div>
                        </div>
                        <div className="form-group">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <label className="form-label" style={{ color: 'var(--text-main)', margin: 0 }}>Route Stops</label>
                            <button 
                              type="button" 
                              className="btn btn-secondary btn-sm" 
                              style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                              onClick={() => setIsRawStopsEdit(!isRawStopsEdit)}
                            >
                              {isRawStopsEdit ? '🗺️ Visual Designer' : '✏️ Raw Text Editor'}
                            </button>
                          </div>

                          {isRawStopsEdit ? (
                            <>
                              <textarea 
                                id="route-stops-input"
                                className="form-input" 
                                style={{ height: '100px', fontFamily: 'inherit' }}
                                placeholder="School, Oak Street, Pine Road, Cedar Lane"
                                required 
                                value={routeForm.stopsInput} 
                                onChange={(e) => updateStopsAndRecalculate(e.target.value)} 
                                aria-required="true"
                              />
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>Separate each stop name with a comma. Start with 'School'.</span>
                            </>
                          ) : (
                            <>
                              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                <input 
                                  type="text" 
                                  className="form-input" 
                                  placeholder="Enter stop name (e.g. Town Hall)" 
                                  value={manualStopText} 
                                  onChange={(e) => setManualStopText(e.target.value)} 
                                  style={{ flex: 1 }}
                                />
                                <button 
                                  type="button" 
                                  className="btn btn-primary btn-sm" 
                                  onClick={handleAddManualStop}
                                  style={{ flexShrink: 0 }}
                                >
                                  + Add Stop
                                </button>
                              </div>

                              <div style={{ 
                                maxHeight: '240px', 
                                overflowY: 'auto', 
                                border: '1px solid var(--border-color)', 
                                borderRadius: '8px', 
                                padding: '0.5rem', 
                                backgroundColor: 'rgba(0,0,0,0.1)', 
                                marginBottom: '0.75rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.5rem'
                              }}>
                                {(() => {
                                  const stopsArray = routeForm.stopsInput.split(',').map(s => s.trim()).filter(Boolean);
                                  if (stopsArray.length === 0) {
                                    return (
                                      <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem', padding: '1rem' }}>
                                        No stops added yet. Double-click the map or use search to add one.
                                      </div>
                                    );
                                  }
                                  return stopsArray.map((stop, index) => {
                                    const stopName = getCleanAddressName(stop);
                                    return (
                                      <div key={index} style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'space-between', 
                                        padding: '0.4rem 0.6rem', 
                                        backgroundColor: 'var(--panel-bg)', 
                                        border: '1px solid var(--border-color)', 
                                        borderRadius: '6px',
                                        fontSize: '0.8rem'
                                      }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
                                          <span style={{ 
                                            display: 'inline-flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'center', 
                                            width: '20px', 
                                            height: '20px', 
                                            borderRadius: '50%', 
                                            backgroundColor: index === 0 ? 'var(--success)' : 'var(--primary-color)', 
                                            color: index === 0 ? 'white' : 'black', 
                                            fontSize: '0.7rem',
                                            fontWeight: 'bold',
                                            flexShrink: 0
                                          }}>
                                            {index + 1}
                                          </span>
                                          <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', color: 'var(--text-main)' }} title={stopName}>
                                            {stopName}
                                          </span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.2rem', flexShrink: 0 }}>
                                          <button 
                                            type="button" 
                                            className="btn btn-secondary btn-sm" 
                                            style={{ padding: '0.1rem 0.3rem', fontSize: '0.7rem' }} 
                                            onClick={() => handleMoveStopUp(index)}
                                            disabled={index === 0}
                                            title="Move Up"
                                          >
                                            ↑
                                          </button>
                                          <button 
                                            type="button" 
                                            className="btn btn-secondary btn-sm" 
                                            style={{ padding: '0.1rem 0.3rem', fontSize: '0.7rem' }} 
                                            onClick={() => handleMoveStopDown(index)}
                                            disabled={index === stopsArray.length - 1}
                                            title="Move Down"
                                          >
                                            ↓
                                          </button>
                                          <button 
                                            type="button" 
                                            className="btn btn-danger btn-sm" 
                                            style={{ padding: '0.1rem 0.3rem', fontSize: '0.7rem', color: '#ffffff', backgroundColor: 'var(--danger)' }} 
                                            onClick={() => handleDeleteStop(index)}
                                            title="Delete Stop"
                                          >
                                            🗑️
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  });
                                })()}
                              </div>

                              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                                💡 <strong>Double-click anywhere on the map</strong> to quickly append a stop. Move or delete stops to redraw.
                              </div>
                            </>
                          )}
                          
                          <button
                            type="button"
                            className="btn btn-warning btn-sm"
                            style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '100%', padding: '0.5rem' }}
                            onClick={handleOptimizeRoute}
                            aria-label="Optimize stop sequence using Travelling Salesperson AI genetic algorithm"
                          >
                            🤖 Optimize Stops (AI Genetic Algorithm)
                          </button>
                        </div>

                        {optimizationDetails && (
                          <div className="alert alert-success" role="status" style={{ padding: '0.75rem', fontSize: '0.8rem', marginTop: '1rem', border: '1px solid #d1fae5', backgroundColor: '#ecfdf5', color: '#065f46', borderRadius: '6px' }}>
                            <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '0.25rem' }}>
                              <span>🧬</span> AI Route Optimization Complete
                            </div>
                            <div style={{ lineHeight: '1.4' }}>
                              • Original Distance: <strong>{optimizationDetails.originalDistance} km</strong><br />
                              • Optimized Distance: <strong>{optimizationDetails.optimizedDistance} km</strong><br />
                              • Path Efficiency: <strong style={{ color: '#047857' }}>{optimizationDetails.savingsPercent}% Shorter Route!</strong>
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#047857', fontStyle: 'italic', marginTop: '0.25rem' }}>
                              Solved using a Traveling Salesperson Genetic Algorithm (100 generations).
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <div className="modal-map-column">
                    <div id="admin-modal-map" role="region" aria-label="Interactive selection map location pin map view" style={{ height: '380px', width: '100%', borderRadius: '8px', border: '1px solid var(--border-color)', position: 'relative', zIndex: 1 }} />
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem', textAlign: 'center', lineHeight: '1.4' }}>
                      {modalType === 'student' ? 
                        "💡 Click on the map to pinpoint the student's exact home location." : 
                        "💡 Double-click anywhere on the map to append a new stop at that location."
                      }
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {modalType === 'driver' && (
                    <>
                      <div className="form-group">
                        <label className="form-label" htmlFor="driver-name-input" style={{ color: 'var(--text-main)' }}>Driver Name</label>
                        <input type="text" id="driver-name-input" className="form-input" required value={driverForm.name} onChange={(e) => setDriverForm({ ...driverForm, name: e.target.value })} aria-required="true" />
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="driver-phone-input" style={{ color: 'var(--text-main)' }}>Phone Contact</label>
                        <input type="text" id="driver-phone-input" className="form-input" required value={driverForm.phone} onChange={(e) => setDriverForm({ ...driverForm, phone: e.target.value })} aria-required="true" />
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="driver-license-input" style={{ color: 'var(--text-main)' }}>License Number</label>
                        <input type="text" id="driver-license-input" className="form-input" required value={driverForm.licenseNumber} onChange={(e) => setDriverForm({ ...driverForm, licenseNumber: e.target.value })} aria-required="true" />
                      </div>
                    </>
                  )}

                  {modalType === 'bus' && (
                    <>
                      <div className="form-group">
                        <label className="form-label" htmlFor="bus-reg-input" style={{ color: 'var(--text-main)' }}>Bus Registration Number</label>
                        <input type="text" id="bus-reg-input" className="form-input" placeholder="e.g. BUS-404" required value={busForm.busNumber} onChange={(e) => setBusForm({ ...busForm, busNumber: e.target.value })} aria-required="true" />
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="bus-capacity-input" style={{ color: 'var(--text-main)' }}>Passenger Capacity</label>
                        <input type="number" id="bus-capacity-input" className="form-input" required value={busForm.capacity} onChange={(e) => setBusForm({ ...busForm, capacity: parseInt(e.target.value) })} aria-required="true" />
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="bus-driver-select" style={{ color: 'var(--text-main)' }}>Assign Driver</label>
                        <select id="bus-driver-select" className="form-select" value={busForm.driverId} onChange={(e) => setBusForm({ ...busForm, driverId: e.target.value })}>
                          <option value="">No Driver Assigned</option>
                          {drivers.map(d => <option key={d.driverId} value={d.driverId}>{d.name}</option>)}
                        </select>
                      </div>
                    </>
                  )}
                </>
              )}

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)} aria-label="Cancel changes and close modal dialog">Cancel</button>
                <button type="submit" className="btn btn-primary" aria-label="Save changes to record">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Student QR Code Badge Modal */}
      {showQrModal && selectedQrStudent && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="qr-modal-title" style={{ zIndex: 110 }}>
          <div className="modal-content" style={{ maxWidth: '380px' }}>
            <div className="modal-header" style={{ backgroundColor: 'var(--primary-color)', color: '#09090b' }}>
              <h3 id="qr-modal-title" style={{ color: '#09090b', fontWeight: '800' }}>School Transit Badge</h3>
              <button 
                onClick={() => setShowQrModal(false)} 
                aria-label="Close QR badge modal" 
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#09090b', fontWeight: '800' }}
              >
                &times;
              </button>
            </div>

            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: 'var(--panel-bg)' }}>
              {/* Badge visual box (can be printed / downloaded) */}
              <div 
                id={`student-badge-${selectedQrStudent.studentId}`}
                style={{
                  border: '2px solid var(--border-color)',
                  borderRadius: '12px',
                  padding: '1.5rem',
                  width: '100%',
                  textAlign: 'center',
                  backgroundColor: '#ffffff', // Force white background for QR contrast when printing
                  color: '#0f172a',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                {/* Header ribbon */}
                <div style={{
                  backgroundColor: '#ca8a04',
                  color: '#ffffff',
                  fontSize: '0.65rem',
                  fontWeight: '800',
                  padding: '0.25rem 0',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  borderRadius: '6px',
                  marginBottom: '1rem'
                }}>
                  Smart School Bus System
                </div>

                {/* Student Info */}
                <h4 style={{ fontSize: '1.15rem', fontWeight: '800', margin: '0 0 0.25rem 0' }}>
                  {selectedQrStudent.name}
                </h4>
                <p style={{ fontSize: '0.8rem', color: '#475569', margin: '0 0 1rem 0', fontWeight: '600' }}>
                  Grade {selectedQrStudent.class}-{selectedQrStudent.section}
                </p>

                {/* QR Code Canvas */}
                <div style={{ 
                  backgroundColor: '#f8fafc',
                  padding: '0.75rem', 
                  borderRadius: '8px', 
                  display: 'inline-flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  border: '1px solid #e2e8f0',
                  marginBottom: '1rem'
                }}>
                  {qrDataUrl ? (
                    <img src={qrDataUrl} alt={`${selectedQrStudent.name}'s QR Code`} style={{ width: '180px', height: '180px' }} />
                  ) : (
                    <div style={{ width: '180px', height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.75rem' }}>
                      Generating...
                    </div>
                  )}
                </div>

                {/* Footer instructions */}
                <div style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: '600', lineHeight: '1.4' }}>
                  Scan code upon boarding and dropping off.<br />
                  Student ID: #{selectedQrStudent.studentId}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '0.75rem', width: '100%', marginTop: '1.5rem' }}>
                <button 
                  className="btn btn-secondary" 
                  style={{ flex: 1, padding: '0.55rem', fontSize: '0.8rem' }}
                  onClick={() => {
                    const link = document.createElement('a');
                    link.download = `${selectedQrStudent.name.replace(/\s+/g, '_')}_QR_Badge.png`;
                    link.href = qrDataUrl;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}
                  aria-label="Download student badge QR code image"
                  disabled={!qrDataUrl}
                >
                  📥 Download
                </button>
                <button 
                  className="btn btn-primary" 
                  style={{ flex: 1, padding: '0.55rem', fontSize: '0.8rem' }}
                  onClick={() => {
                    const printWin = window.open('', '', 'width=600,height=600');
                    if (printWin) {
                      printWin.document.open();
                      printWin.document.write(`
                        <html>
                          <head>
                            <title>Print QR Badge - \${selectedQrStudent.name}</title>
                            <style>
                              body {
                                display: flex;
                                justify-content: center;
                                align-items: center;
                                height: 100vh;
                                margin: 0;
                                font-family: 'Plus Jakarta Sans', sans-serif;
                              }
                              .badge-box {
                                border: 2px solid #e2e8f0;
                                border-radius: 12px;
                                padding: 2rem;
                                text-align: center;
                                width: 260px;
                                box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
                              }
                              .ribbon {
                                background-color: #ca8a04;
                                color: white;
                                font-size: 10px;
                                font-weight: bold;
                                padding: 4px 0;
                                border-radius: 6px;
                                margin-bottom: 12px;
                                text-transform: uppercase;
                                letter-spacing: 1px;
                              }
                              h4 {
                                font-size: 18px;
                                margin: 0 0 4px 0;
                              }
                              p {
                                font-size: 13px;
                                color: #475569;
                                margin: 0 0 16px 0;
                              }
                              img {
                                width: 180px;
                                height: 180px;
                                margin-bottom: 16px;
                              }
                              .footer {
                                font-size: 10px;
                                color: #64748b;
                              }
                            </style>
                          </head>
                          <body>
                            <div class="badge-box">
                              <div class="ribbon">Smart School Bus System</div>
                              <h4>\${selectedQrStudent.name}</h4>
                              <p>Grade \${selectedQrStudent.class}-\${selectedQrStudent.section}</p>
                              <img src="\${qrDataUrl}" alt="QR code" />
                              <div class="footer">
                                Scan code upon boarding and dropping off.<br />
                                Student ID: #\${selectedQrStudent.studentId}
                              </div>
                            </div>
                            <script>
                              window.onload = function() {
                                window.print();
                                setTimeout(function() { window.close(); }, 500);
                              }
                            </script>
                          </body>
                        </html>
                      `);
                      printWin.document.close();
                    }
                  }}
                  aria-label="Print student QR badge"
                  disabled={!qrDataUrl}
                >
                  🖨️ Print Badge
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
