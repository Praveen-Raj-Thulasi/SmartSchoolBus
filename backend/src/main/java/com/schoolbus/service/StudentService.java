package com.schoolbus.service;

import com.schoolbus.model.Student;
import com.schoolbus.model.User;
import com.schoolbus.repository.StudentRepository;
import com.schoolbus.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import java.util.List;
import java.util.Optional;

@Service
public class StudentService {

    @Autowired
    private StudentRepository studentRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private com.schoolbus.repository.BusRepository busRepository;

    public List<Student> getAllStudents() {
        return studentRepository.findAll();
    }

    public Optional<Student> getStudentById(Long studentId) {
        return studentRepository.findById(studentId);
    }

    public List<Student> getStudentsByParentId(Long parentId) {
        return studentRepository.findByParentId(parentId);
    }

    public List<Student> getStudentsByRouteId(Long routeId) {
        return studentRepository.findByRouteId(routeId);
    }

    public Student addStudent(Student student) {
        if (student.getSeatNumber() != null && student.getSeatNumber() < 1) {
            throw new IllegalArgumentException("Seat number cannot be less than 1");
        }
        if (student.getBusId() != null) {
            assignNextAvailableSeat(student);
        }
        Student saved = studentRepository.save(student);

        // Auto-create User login credentials matching React logic
        User user = new User();
        user.setUsername("student_" + saved.getStudentId());
        user.setPassword(passwordEncoder.encode("password"));
        user.setRole("student");
        user.setName(saved.getName());
        user.setStudentId(saved.getStudentId());
        userRepository.save(user);

        return saved;
    }

    public Student updateStudent(Long studentId, Student studentData) {
        if (studentData.getSeatNumber() != null && studentData.getSeatNumber() < 1) {
            throw new IllegalArgumentException("Seat number cannot be less than 1");
        }
        Optional<Student> studentOpt = studentRepository.findById(studentId);
        if (studentOpt.isPresent()) {
            Student student = studentOpt.get();
            student.setName(studentData.getName());
            student.setStudentClass(studentData.getStudentClass());
            student.setSection(studentData.getSection());
            student.setParentId(studentData.getParentId());
            student.setRouteId(studentData.getRouteId());
            
            // Handle seat assignment on bus change or seat update
            if (studentData.getBusId() != null) {
                if (!studentData.getBusId().equals(student.getBusId()) || 
                    student.getSeatNumber() == null || 
                    (studentData.getSeatNumber() != null && !studentData.getSeatNumber().equals(student.getSeatNumber()))) {
                    
                    student.setBusId(studentData.getBusId());
                    student.setSeatNumber(studentData.getSeatNumber()); // Use provided manual seat if any
                    assignNextAvailableSeat(student);
                } else if (studentData.getSeatNumber() == null) {
                    student.setSeatNumber(null);
                    assignNextAvailableSeat(student);
                }
            } else {
                student.setBusId(null);
                student.setSeatNumber(null);
            }
            
            student.setAddress(studentData.getAddress());
            Student updated = studentRepository.save(student);

            // Sync User login name
            Optional<User> userOpt = userRepository.findByStudentId(studentId);
            if (userOpt.isPresent()) {
                User user = userOpt.get();
                user.setName(updated.getName());
                userRepository.save(user);
            }
            return updated;
        }
        throw new RuntimeException("Student not found");
    }

    private void assignNextAvailableSeat(Student student) {
        if (student.getBusId() == null) {
            student.setSeatNumber(null);
            return;
        }

        Optional<com.schoolbus.model.Bus> busOpt = busRepository.findById(student.getBusId());
        if (busOpt.isEmpty()) {
            throw new IllegalArgumentException("Bus not found: " + student.getBusId());
        }
        int capacity = busOpt.get().getCapacity();

        if (student.getSeatNumber() != null) {
            if (student.getSeatNumber() > capacity) {
                throw new IllegalArgumentException("Seat number " + student.getSeatNumber() + " exceeds the bus capacity of " + capacity);
            }
            return;
        }

        List<Student> studentsOnBus = studentRepository.findByBusId(student.getBusId());
        java.util.Set<Integer> assignedSeats = new java.util.HashSet<>();
        for (Student s : studentsOnBus) {
            if (student.getStudentId() != null && student.getStudentId().equals(s.getStudentId())) {
                continue;
            }
            if (s.getSeatNumber() != null) {
                assignedSeats.add(s.getSeatNumber());
            }
        }

        for (int seat = 1; seat <= capacity; seat++) {
            if (!assignedSeats.contains(seat)) {
                student.setSeatNumber(seat);
                return;
            }
        }

        throw new IllegalArgumentException("Cannot assign seat: Bus is already full (Capacity: " + capacity + ").");
    }

    public void deleteStudent(Long studentId) {
        studentRepository.deleteById(studentId);
        userRepository.findByStudentId(studentId).ifPresent(u -> userRepository.delete(u)); // clean up credential link
    }
}
