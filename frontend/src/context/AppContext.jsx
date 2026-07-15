import { createContext, useState, useEffect } from 'react';

/* eslint-disable-next-line react-refresh/only-export-components */
export const AppContext = createContext();

const API_BASE = 'http://localhost:8081';

export const AppProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('sbm_currentUser');
    return saved ? JSON.parse(saved) : null;
  });

  const [token, setToken] = useState(() => {
    return localStorage.getItem('sbm_token') || null;
  });

  const [users, setUsers] = useState([]);
  const [students, setStudents] = useState([]);
  const [parents, setParents] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [buses, setBuses] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [trips, setTrips] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [routeOptimizations, setRouteOptimizations] = useState([]);
  const [emergencies, setEmergencies] = useState([]);
  const [attendanceEvents, setAttendanceEvents] = useState([]);
  const [grievances, setGrievances] = useState([]);
  const [driverRatings, setDriverRatings] = useState([]);
  const [studentRequests, setStudentRequests] = useState([]);

  // Sync to local storage
  useEffect(() => {
    localStorage.setItem('sbm_currentUser', JSON.stringify(currentUser));
  }, [currentUser]);

  useEffect(() => {
    if (token) {
      localStorage.setItem('sbm_token', token);
    } else {
      localStorage.removeItem('sbm_token');
    }
  }, [token]);

  const authFetch = async (url, options = {}) => {
    const headers = { ...options.headers };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401 || response.status === 403) {
      setCurrentUser(null);
      setToken(null);
    }
    return response;
  };

  const fetchData = async () => {
    try {
      const requestsUrl = (currentUser && currentUser.role === 'parent' && currentUser.parentId)
        ? `${API_BASE}/api/student-requests/parent/${currentUser.parentId}`
        : `${API_BASE}/api/student-requests`;

      const [usersRes, studentsRes, parentsRes, driversRes, busesRes, routesRes, notificationsRes, attendanceRes, tripsRes, leavesRes, optRes, emerRes, eventsRes, grievancesRes, ratingsRes, requestsRes] = await Promise.all([
        authFetch(`${API_BASE}/api/users`),
        authFetch(`${API_BASE}/api/students`),
        authFetch(`${API_BASE}/api/parents`),
        authFetch(`${API_BASE}/api/drivers`),
        authFetch(`${API_BASE}/api/buses`),
        authFetch(`${API_BASE}/api/routes`),
        authFetch(`${API_BASE}/api/notifications`),
        authFetch(`${API_BASE}/api/attendance`),
        authFetch(`${API_BASE}/api/trips`),
        authFetch(`${API_BASE}/api/leaves`),
        authFetch(`${API_BASE}/api/route-optimization/history`),
        authFetch(`${API_BASE}/api/emergency/active`),
        authFetch(`${API_BASE}/api/attendance/scan/events`),
        authFetch(`${API_BASE}/api/grievances`),
        authFetch(`${API_BASE}/api/ratings`),
        authFetch(requestsUrl)
      ]);

      if (usersRes.ok) setUsers(await usersRes.json());
      if (studentsRes.ok) setStudents(await studentsRes.json());
      if (parentsRes.ok) setParents(await parentsRes.json());
      if (driversRes.ok) setDrivers(await driversRes.json());
      if (busesRes.ok) setBuses(await busesRes.json());
      if (routesRes.ok) setRoutes(await routesRes.json());
      if (notificationsRes.ok) setNotifications(await notificationsRes.json());
      if (attendanceRes.ok) setAttendance(await attendanceRes.json());
      if (tripsRes.ok) setTrips(await tripsRes.json());
      if (leavesRes.ok) setLeaveRequests(await leavesRes.json());
      if (optRes.ok) setRouteOptimizations(await optRes.json());
      if (emerRes.ok) setEmergencies(await emerRes.json());
      if (eventsRes.ok) setAttendanceEvents(await eventsRes.json());
      if (grievancesRes.ok) setGrievances(await grievancesRes.json());
      if (ratingsRes.ok) setDriverRatings(await ratingsRes.json());
      if (requestsRes.ok) setStudentRequests(await requestsRes.json());
    } catch (error) {
      console.error("Error fetching data from backend:", error);
    }
  };

  const fetchTrips = async () => {
    try {
      const [tripsRes, emerRes] = await Promise.all([
        authFetch(`${API_BASE}/api/trips`),
        authFetch(`${API_BASE}/api/emergency/active`)
      ]);
      if (tripsRes.ok) setTrips(await tripsRes.json());
      if (emerRes.ok) setEmergencies(await emerRes.json());
    } catch (e) {
      console.error("Error fetching trips:", e);
    }
  };

  const fetchAttendance = async () => {
    try {
      const [attendanceRes, eventsRes] = await Promise.all([
        authFetch(`${API_BASE}/api/attendance`),
        authFetch(`${API_BASE}/api/attendance/scan/events`)
      ]);
      if (attendanceRes.ok) setAttendance(await attendanceRes.json());
      if (eventsRes.ok) setAttendanceEvents(await eventsRes.json());
    } catch (e) {
      console.error("Error fetching attendance:", e);
    }
  };

  const fetchNotifications = async () => {
    try {
      const res = await authFetch(`${API_BASE}/api/notifications`);
      if (res.ok) setNotifications(await res.json());
    } catch (e) {
      console.error("Error fetching notifications:", e);
    }
  };

  useEffect(() => {
    if (token) {
      fetchData();
    } else {
      setUsers([]);
      setStudents([]);
      setParents([]);
      setDrivers([]);
      setBuses([]);
      setRoutes([]);
      setNotifications([]);
      setAttendance([]);
      setTrips([]);
      setLeaveRequests([]);
      setRouteOptimizations([]);
      setEmergencies([]);
      setAttendanceEvents([]);
      setGrievances([]);
      setDriverRatings([]);
      setStudentRequests([]);
    }
  }, [currentUser, token]);

  // WebSocket real-time updates connection handler with exponential backoff auto-reconnect
  useEffect(() => {
    if (!token) return;

    let ws = null;
    let reconnectTimeout = null;
    let backoff = 1000;

    const connectWebSocket = () => {
      const wsUrl = API_BASE.replace(/^http/, 'ws') + '/ws-updates';
      console.log(`[WebSocket] Connecting to ${wsUrl}...`);
      
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[WebSocket] Connected successfully!');
        backoff = 1000; // Reset backoff
      };

      ws.onmessage = (event) => {
        const topic = event.data;
        console.log(`[WebSocket] Received update event: ${topic}`);

        if (topic === 'trips') {
          fetchTrips();
        } else if (topic === 'attendance') {
          fetchAttendance();
        } else if (topic === 'notifications') {
          fetchNotifications();
        } else if (topic === 'emergencies') {
          fetchTrips();
        }
      };

      ws.onclose = (event) => {
        console.warn(`[WebSocket] Connection closed (code: ${event.code}). Reconnecting...`);
        cleanup();
        
        reconnectTimeout = setTimeout(() => {
          connectWebSocket();
          backoff = Math.min(backoff * 2, 30000);
        }, backoff);
      };

      ws.onerror = (err) => {
        console.error('[WebSocket] Error detected:', err);
        ws.close();
      };
    };

    const cleanup = () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
      }
    };

    connectWebSocket();

    return () => {
      cleanup();
    };
  }, [token]);

  // Auth Helpers
  const login = async (username, password) => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok) {
        setCurrentUser(data.user);
        setToken(data.token);
        return { success: true, user: data.user };
      }
      return { success: false, message: data.message || 'Invalid username or password' };
    } catch (e) {
      return { success: false, message: 'Failed to connect to authentication service.' };
    }
  };

  const logout = () => {
    setCurrentUser(null);
    setToken(null);
  };

  const deleteAccount = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/users/me`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok) {
        logout();
        return { success: true, message: data.message };
      }
      return { success: false, message: data.message || 'Failed to delete account' };
    } catch (e) {
      return { success: false, message: 'Connection error while deleting account.' };
    }
  };

  const resetPassword = async (emailOrPhone, otp, newPassword) => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailOrPhone, otp, password: newPassword })
      });
      const data = await res.json();
      if (res.ok) {
        return { success: true };
      }
      return { success: false, message: data.message || 'Failed to reset password.' };
    } catch (e) {
      return { success: false, message: 'Failed to reset password.' };
    }
  };

  const sendOtp = async (email, phone = null, purpose = null) => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, phone, purpose })
      });
      const data = await res.json();
      return { success: res.ok, message: data.message || 'Failed to send OTP' };
    } catch (e) {
      return { success: false, message: 'Network error sending OTP.' };
    }
  };

  const registerUser = async (userData) => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      });
      const data = await res.json();
      if (res.ok) {
        return { success: true };
      }
      return { success: false, message: data.message || 'Registration failed' };
    } catch (e) {
      return { success: false, message: 'Failed to register user.' };
    }
  };

  // Add Notification helper
  const addNotification = async (userId, message, type) => {
    try {
      const res = await authFetch(`${API_BASE}/api/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, message, type })
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // CRUD for Students
  const addStudent = async (studentData) => {
    try {
      const res = await authFetch(`${API_BASE}/api/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(studentData)
      });
      if (res.ok) {
        const student = await res.json();
        await fetchData();
        return { success: true, student };
      }
      return { success: false };
    } catch (e) {
      console.error(e);
      return { success: false };
    }
  };

  const updateStudent = async (studentId, updatedData) => {
    try {
      const res = await authFetch(`${API_BASE}/api/students/${studentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData)
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const deleteStudent = async (studentId) => {
    try {
      const res = await authFetch(`${API_BASE}/api/students/${studentId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // CRUD for Parents
  const addParent = async (parentData) => {
    try {
      const res = await authFetch(`${API_BASE}/api/parents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parentData)
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const updateParent = async (parentId, updatedData) => {
    try {
      const res = await authFetch(`${API_BASE}/api/parents/${parentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData)
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const deleteParent = async (parentId) => {
    try {
      const res = await authFetch(`${API_BASE}/api/parents/${parentId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // CRUD for Drivers
  const addDriver = async (driverData) => {
    try {
      const res = await authFetch(`${API_BASE}/api/drivers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(driverData)
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const updateDriver = async (driverId, updatedData) => {
    try {
      const res = await authFetch(`${API_BASE}/api/drivers/${driverId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData)
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const deleteDriver = async (driverId) => {
    try {
      const res = await authFetch(`${API_BASE}/api/drivers/${driverId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // CRUD for Buses
  const addBus = async (busData) => {
    try {
      const res = await authFetch(`${API_BASE}/api/buses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(busData)
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const updateBus = async (busId, updatedData) => {
    try {
      const res = await authFetch(`${API_BASE}/api/buses/${busId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData)
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const deleteBus = async (busId) => {
    try {
      const res = await authFetch(`${API_BASE}/api/buses/${busId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // CRUD for Routes
  const addRoute = async (routeData) => {
    try {
      const res = await authFetch(`${API_BASE}/api/routes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(routeData)
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const updateRoute = async (routeId, updatedData) => {
    try {
      const res = await authFetch(`${API_BASE}/api/routes/${routeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData)
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const deleteRoute = async (routeId) => {
    try {
      const res = await authFetch(`${API_BASE}/api/routes/${routeId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Attendance management helpers
  const markStudentAttendance = async (studentId, status, dateString = null) => {
    try {
      const res = await authFetch(`${API_BASE}/api/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, status, date: dateString })
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Trip execution simulation helpers
  const startTrip = async (routeId, busId, driverId) => {
    try {
      const res = await authFetch(`${API_BASE}/api/trips/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routeId, busId, driverId })
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const advanceTripStop = async (tripId) => {
    try {
      const res = await authFetch(`${API_BASE}/api/trips/${tripId}/advance`, {
        method: 'POST'
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const endTrip = async (tripId) => {
    try {
      const res = await authFetch(`${API_BASE}/api/trips/${tripId}/end`, {
        method: 'POST'
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const submitLeaveRequest = async (studentId, date, reason, tripType = 'Both') => {
    try {
      const res = await authFetch(`${API_BASE}/api/leaves`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, date, reason, tripType })
      });
      if (res.ok) {
        await fetchData();
        return { success: true };
      }
      return { success: false, message: 'Failed to submit leave request.' };
    } catch (e) {
      console.error(e);
      return { success: false, message: 'Network error submitting leave.' };
    }
  };

  const cancelLeaveRequest = async (leaveId) => {
    try {
      const res = await authFetch(`${API_BASE}/api/leaves/${leaveId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await fetchData();
        return { success: true };
      }
      return { success: false, message: 'Failed to cancel leave request.' };
    } catch (e) {
      console.error(e);
      return { success: false, message: 'Network error canceling leave.' };
    }
  };

  const triggerEmergency = async (tripId, message) => {
    try {
      const res = await authFetch(`${API_BASE}/api/trips/${tripId}/emergency`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const clearEmergency = async (tripId) => {
    try {
      const res = await authFetch(`${API_BASE}/api/trips/${tripId}/clear-emergency`, {
        method: 'POST'
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const triggerDeviation = async (tripId, message) => {
    try {
      const res = await authFetch(`${API_BASE}/api/trips/${tripId}/deviate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const clearDeviation = async (tripId) => {
    try {
      const res = await authFetch(`${API_BASE}/api/trips/${tripId}/clear-deviate`, {
        method: 'POST'
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Mock export reports to CSV download
  const downloadAttendanceReport = (reportType, id) => {
    let reportData = [];
    let filename = '';

    if (reportType === 'student') {
      const records = attendance.filter(a => a.studentId === id);
      const student = students.find(s => s.studentId === id);
      filename = `Attendance_Report_Student_${student ? student.name.replace(/\s+/g, '_') : id}.csv`;
      reportData = [
        ['Date', 'Time', 'Student Name', 'Status'],
        ...records.map(r => [r.date, r.time, student ? student.name : r.studentId, r.status])
      ];
    } else if (reportType === 'bus') {
      const bus = buses.find(b => b.busId === id);
      const busStudents = students.filter(s => s.busId === id);
      const studentIds = busStudents.map(s => s.studentId);
      const records = attendance.filter(a => studentIds.includes(a.studentId));
      filename = `Attendance_Report_Bus_${bus ? bus.busNumber : id}.csv`;
      reportData = [
        ['Date', 'Time', 'Student Name', 'Class-Section', 'Status'],
        ...records.map(r => {
          const s = students.find(stud => stud.studentId === r.studentId);
          return [r.date, r.time, s ? s.name : r.studentId, s ? `${s.class}-${s.section}` : '', r.status];
        })
      ];
    } else if (reportType === 'route') {
      const route = routes.find(r => r.routeId === id);
      const routeStudents = students.filter(s => s.routeId === id);
      const studentIds = routeStudents.map(s => s.studentId);
      const records = attendance.filter(a => studentIds.includes(a.studentId));
      filename = `Attendance_Report_Route_${route ? route.routeName.replace(/\s+/g, '_') : id}.csv`;
      reportData = [
        ['Date', 'Time', 'Student Name', 'Stop Address', 'Status'],
        ...records.map(r => {
          const s = students.find(stud => stud.studentId === r.studentId);
          return [r.date, r.time, s ? s.name : r.studentId, s ? s.address : '', r.status];
        })
      ];
    }

    const csvContent = "data:text/csv;charset=utf-8," 
      + reportData.map(e => e.map(val => `"${val}"`).join(",")).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const generateRouteOptimization = async (routeId, trafficLevel, roadClosures, weather) => {
    try {
      const res = await authFetch(`${API_BASE}/api/route-optimization/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routeId, trafficLevel, roadClosures, weather })
      });
      if (res.ok) {
        await fetchData();
        return await res.json();
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  };

  const optimizeRouteAPI = async (stops) => {
    try {
      const res = await authFetch(`${API_BASE}/api/route-optimization/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stops })
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.error("Route optimization API failed:", e);
    }
    return null;
  };

  const pingGps = async (tripId, latitude, longitude, speed) => {
    try {
      const res = await authFetch(`${API_BASE}/api/gps/ping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripId, latitude, longitude, speed })
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  };

  const getLatestGps = async (tripId) => {
    try {
      const res = await authFetch(`${API_BASE}/api/gps/trip/${tripId}/latest`);
      if (res.ok) return await res.json();
    } catch (e) {
      console.error(e);
    }
    return null;
  };

  const getLatestPrediction = async (tripId) => {
    try {
      const res = await authFetch(`${API_BASE}/api/gps/trip/${tripId}/prediction`);
      if (res.ok) return await res.json();
    } catch (e) {
      console.error(e);
    }
    return null;
  };

  const triggerEmergencySos = async (tripId, reason, latitude, longitude, studentsOnboard) => {
    try {
      const res = await authFetch(`${API_BASE}/api/emergency/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripId, reason, latitude, longitude, studentsOnboard })
      });
      if (res.ok) {
        await fetchData();
        return await res.json();
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  };

  const resolveEmergency = async (emergencyId, resolutionNotes) => {
    try {
      const res = await authFetch(`${API_BASE}/api/emergency/${emergencyId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolutionNotes })
      });
      if (res.ok) {
        await fetchData();
        return await res.json();
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  };

  const getStudentQr = async (studentId) => {
    try {
      const res = await authFetch(`${API_BASE}/api/attendance/scan/qr/${studentId}`);
      if (res.ok) return await res.json();
    } catch (e) {
      console.error(e);
    }
    return null;
  };

  const scanStudentQr = async (tokenString) => {
    try {
      const res = await authFetch(`${API_BASE}/api/attendance/scan/qr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenString })
      });
      if (res.ok) {
        await fetchData();
        return { success: true, event: await res.json() };
      }
      const data = await res.json();
      return { success: false, message: data.message };
    } catch (e) {
      return { success: false, message: 'Scan failed' };
    }
  };

  const registerFace = async (studentId, embedding) => {
    try {
      const res = await authFetch(`${API_BASE}/api/attendance/scan/face/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, embedding })
      });
      if (res.ok) {
        await fetchData();
        return await res.json();
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  };

  const matchFace = async (embedding) => {
    try {
      const res = await authFetch(`${API_BASE}/api/attendance/scan/face/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embedding })
      });
      if (res.ok) {
        await fetchData();
        return { success: true, event: await res.json() };
      }
      const data = await res.json();
      return { success: false, message: data.message };
    } catch (e) {
      return { success: false, message: 'Face matching failed' };
    }
  };

  const submitGrievance = async (parentId, title, category, description) => {
    try {
      const res = await authFetch(`${API_BASE}/api/grievances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId, title, category, description })
      });
      if (res.ok) {
        await fetchData();
        return { success: true };
      }
      return { success: false, message: 'Failed to submit grievance.' };
    } catch (e) {
      return { success: false, message: 'Network error.' };
    }
  };

  const resolveGrievance = async (grievanceId, resolutionNotes) => {
    try {
      const res = await authFetch(`${API_BASE}/api/grievances/${grievanceId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolutionNotes })
      });
      if (res.ok) {
        await fetchData();
        return { success: true };
      }
      return { success: false, message: 'Failed to resolve grievance.' };
    } catch (e) {
      return { success: false, message: 'Network error.' };
    }
  };

  const submitDriverRating = async (driverId, tripId, stars, comments) => {
    try {
      const parentId = currentUser.parentId || 1;
      const res = await authFetch(`${API_BASE}/api/ratings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId, driverId, tripId, stars, comments })
      });
      if (res.ok) {
        await fetchData();
        return { success: true };
      }
      return { success: false, message: 'Failed to submit rating.' };
    } catch (e) {
      return { success: false, message: 'Network error.' };
    }
  };

  const submitStudentRequest = async (requestData) => {
    try {
      const res = await authFetch(`${API_BASE}/api/student-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });
      if (res.ok) {
        await fetchData();
        return { success: true };
      }
      return { success: false, message: 'Failed to submit student request.' };
    } catch (e) {
      return { success: false, message: 'Network error submitting request.' };
    }
  };

  const approveStudentRequest = async (requestId) => {
    try {
      const res = await authFetch(`${API_BASE}/api/student-requests/${requestId}/approve`, {
        method: 'POST'
      });
      if (res.ok) {
        await fetchData();
        return { success: true };
      }
      return { success: false, message: 'Failed to approve student request.' };
    } catch (e) {
      return { success: false, message: 'Network error.' };
    }
  };

  const rejectStudentRequest = async (requestId) => {
    try {
      const res = await authFetch(`${API_BASE}/api/student-requests/${requestId}/reject`, {
        method: 'POST'
      });
      if (res.ok) {
        await fetchData();
        return { success: true };
      }
      return { success: false, message: 'Failed to reject student request.' };
    } catch (e) {
      return { success: false, message: 'Network error.' };
    }
  };

  return (
    <AppContext.Provider value={{
      currentUser,
      users,
      students,
      parents,
      drivers,
      buses,
      routes,
      notifications,
      attendance,
      trips,
      login,
      logout,
      deleteAccount,
      resetPassword,
      registerUser,
      sendOtp,
      setCurrentUser,
      addNotification,
      addStudent,
      updateStudent,
      deleteStudent,
      addParent,
      updateParent,
      deleteParent,
      addDriver,
      updateDriver,
      deleteDriver,
      addBus,
      updateBus,
      deleteBus,
      addRoute,
      updateRoute,
      deleteRoute,
      markStudentAttendance,
      startTrip,
      advanceTripStop,
      endTrip,
      downloadAttendanceReport,
      leaveRequests,
      submitLeaveRequest,
      cancelLeaveRequest,
      triggerEmergency,
      clearEmergency,
      triggerDeviation,
      clearDeviation,
      routeOptimizations,
      emergencies,
      attendanceEvents,
      generateRouteOptimization,
      pingGps,
      getLatestGps,
      getLatestPrediction,
      triggerEmergencySos,
      resolveEmergency,
      getStudentQr,
      scanStudentQr,
      registerFace,
      matchFace,
      optimizeRouteAPI,
      grievances,
      driverRatings,
      submitGrievance,
      resolveGrievance,
      submitDriverRating,
      studentRequests,
      submitStudentRequest,
      approveStudentRequest,
      rejectStudentRequest
    }}>
      {children}
    </AppContext.Provider>
  );
};
