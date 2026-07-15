package com.schoolbus.service;

import com.schoolbus.model.Bus;
import com.schoolbus.repository.BusRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.util.List;
import java.util.Optional;

@Service
public class BusService {

    @Autowired
    private BusRepository busRepository;

    public List<Bus> getAllBuses() {
        return busRepository.findAll();
    }

    public Optional<Bus> getBusById(Long busId) {
        return busRepository.findById(busId);
    }

    public Bus addBus(Bus bus) {
        if (bus.getBusId() == null || bus.getBusId() == null) {
        }
        bus.setCurrentStatus("Idle");
        return busRepository.save(bus);
    }

    public Bus updateBus(Long busId, Bus busData) {
        Optional<Bus> busOpt = busRepository.findById(busId);
        if (busOpt.isPresent()) {
            Bus bus = busOpt.get();
            bus.setBusNumber(busData.getBusNumber());
            bus.setCapacity(busData.getCapacity());
            bus.setDriverId(busData.getDriverId());
            if (busData.getCurrentStatus() != null) {
                bus.setCurrentStatus(busData.getCurrentStatus());
            }
            if (busData.getMaintenanceStatus() != null) {
                bus.setMaintenanceStatus(busData.getMaintenanceStatus());
            }
            return busRepository.save(bus);
        }
        throw new RuntimeException("Bus not found");
    }

    public void deleteBus(Long busId) {
        busRepository.deleteById(busId);
    }
}
