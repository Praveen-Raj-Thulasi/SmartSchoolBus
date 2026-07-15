package com.schoolbus.service;

import com.schoolbus.model.Attendance;
import com.schoolbus.model.Student;
import com.schoolbus.model.Trip;
import com.schoolbus.repository.AttendanceRepository;
import com.schoolbus.repository.StudentRepository;
import com.schoolbus.repository.UserRepository;
import com.schoolbus.repository.TripRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import com.schoolbus.websocket.RealtimeUpdateHandler;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Optional;

@Service
public class AttendanceService {

    @Autowired
    private RealtimeUpdateHandler updateHandler;

    @Autowired
    private AttendanceRepository attendanceRepository;

    @Autowired
    private StudentRepository studentRepository;

    @Autowired
    private com.schoolbus.repository.BusRepository busRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private NotificationService notificationService;

    @Autowired
    private TripRepository tripRepository;

    public List<Attendance> getAllAttendance() {
        return attendanceRepository.findAll();
    }

    public List<Attendance> getAttendanceForStudent(Long studentId) {
        return attendanceRepository.findByStudentId(studentId);
    }

    public List<Attendance> getAttendanceForStudents(List<String> studentIds) {
        return attendanceRepository.findByStudentIdIn(studentIds);
    }

    public Attendance markAttendance(Long studentId, String status, String dateString) {
        String today = (dateString != null && dateString != null) 
                       ? dateString 
                       : LocalDate.now().toString();

        Optional<Student> studentOpt = studentRepository.findById(studentId);
        if (studentOpt.isEmpty()) {
            throw new RuntimeException("Student not found");
        }
        Student student = studentOpt.get();

        // Sequence violation (anti-passback) checks
        List<Attendance> todayRecords = attendanceRepository.findByStudentId(studentId).stream()
                .filter(a -> today.equals(a.getDate()))
                .sorted((a1, a2) -> a1.getTime().compareTo(a2.getTime()))
                .toList();

        String lastStatus = todayRecords.isEmpty() ? null : todayRecords.get(todayRecords.size() - 1).getStatus();

        if ("Boarded".equalsIgnoreCase(status)) {
            if ("Boarded".equalsIgnoreCase(lastStatus)) {
                throw new RuntimeException("Student is already boarded. Cannot board again without being dropped.");
            }
        } else if ("Dropped".equalsIgnoreCase(status)) {
            if (!"Boarded".equalsIgnoreCase(lastStatus)) {
                throw new RuntimeException("Student must be boarded before they can be dropped.");
            }
        }

        if ("Boarded".equalsIgnoreCase(status)) {
            // Find the bus being used for this student
            Long busId = student.getBusId();
            if (student.getRouteId() != null) {
                Optional<Trip> activeTripOpt = tripRepository.findAll().stream()
                        .filter(t -> "Active".equalsIgnoreCase(t.getStatus()) && student.getRouteId().equals(t.getRouteId()))
                        .findFirst();
                if (activeTripOpt.isPresent()) {
                    busId = activeTripOpt.get().getBusId();
                }
            }

            if (busId != null) {
                final Long finalBusId = busId;
                com.schoolbus.model.Bus bus = busRepository.findById(busId)
                        .orElseThrow(() -> new RuntimeException("Bus not found"));
                int capacity = bus.getCapacity();

                // Calculate headcount: count students whose latest attendance record today is "Boarded"
                long currentHeadcount = studentRepository.findAll().stream()
                        .filter(s -> {
                            Long sBusId = s.getBusId();
                            if (s.getRouteId() != null) {
                                Optional<Trip> sActiveTripOpt = tripRepository.findAll().stream()
                                        .filter(t -> "Active".equalsIgnoreCase(t.getStatus()) && s.getRouteId().equals(t.getRouteId()))
                                        .findFirst();
                                if (sActiveTripOpt.isPresent()) {
                                    sBusId = sActiveTripOpt.get().getBusId();
                                }
                            }
                            if (finalBusId.equals(sBusId)) {
                                List<Attendance> sAttendance = attendanceRepository.findByStudentId(s.getStudentId());
                                Optional<Attendance> latestToday = sAttendance.stream()
                                        .filter(a -> today.equals(a.getDate()))
                                        .max((a1, a2) -> a1.getTime().compareTo(a2.getTime()));
                                return latestToday.isPresent() && "Boarded".equalsIgnoreCase(latestToday.get().getStatus());
                            }
                            return false;
                        })
                        .count();

                if (currentHeadcount >= capacity) {
                    // Notify school admins of capacity violation
                    userRepository.findAll().stream()
                            .filter(u -> "admin".equalsIgnoreCase(u.getRole()))
                            .forEach(admin -> {
                                notificationService.createNotification(
                                        admin.getUserId(),
                                        String.format("🚨 CAPACITY VIOLATION: Bus %s has reached its maximum capacity of %d. Student %s was denied boarding.", 
                                                bus.getBusNumber(), capacity, student.getName()),
                                        "Capacity Violation"
                                );
                            });
                    System.err.println("CAPACITY VIOLATION: Bus " + bus.getBusNumber() + " capacity: " + capacity + ", headcount: " + currentHeadcount);
                    throw new RuntimeException("Bus capacity limit reached. Cannot board student: " + student.getName());
                }
            }
        }

        String nowTime = LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm"));

        Attendance attendance = new Attendance();
        attendance.setStudentId(studentId);
        attendance.setDate(today);
        attendance.setStatus(status);
        attendance.setTime(nowTime);

        Attendance saved = attendanceRepository.save(attendance);

        // Send notification to parent matching React logic
        if (student.getParentId() != null) {
            // Find user associated with this parent
            userRepository.findAll().stream()
                .filter(u -> student.getParentId().equals(u.getParentId()))
                .findFirst()
                .ifPresent(parentUser -> {
                    notificationService.createNotification(
                        parentUser.getUserId(),
                        String.format("Your child %s was marked %s at %s.", student.getName(), status, nowTime),
                        "Attendance Alert"
                    );
                });
        }

        // Sync with active trip logs for real-time dashboard telemetry
        if (student.getRouteId() != null) {
            tripRepository.findAll().stream()
                .filter(t -> "Active".equalsIgnoreCase(t.getStatus()) && student.getRouteId().equals(t.getRouteId()))
                .findFirst()
                .ifPresent(trip -> {
                    java.util.List<String> logs = new java.util.ArrayList<>(trip.getLogs());
                    logs.add(String.format("%s marked %s.", student.getName(), status));
                    trip.setLogs(logs);
                    tripRepository.save(trip);
                    System.out.println("LOGGED attendance to active trip ID " + trip.getTripId() + " for student " + student.getName());
                });
        }

        updateHandler.sendUpdateNotification("attendance");
        updateHandler.sendUpdateNotification("trips");
        return saved;
    }
}
