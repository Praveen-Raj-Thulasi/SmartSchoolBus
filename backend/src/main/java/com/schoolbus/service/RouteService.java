package com.schoolbus.service;

import com.schoolbus.model.Route;
import com.schoolbus.repository.RouteRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.util.List;
import java.util.Optional;

@Service
public class RouteService {

    @Autowired
    private RouteRepository routeRepository;

    public List<Route> getAllRoutes() {
        return routeRepository.findAll();
    }

    public Optional<Route> getRouteById(Long routeId) {
        return routeRepository.findById(routeId);
    }

    public Route addRoute(Route route) {
        if (route.getRouteId() == null || route.getRouteId() == null) {
        }
        return routeRepository.save(route);
    }

    public Route updateRoute(Long routeId, Route routeData) {
        Optional<Route> routeOpt = routeRepository.findById(routeId);
        if (routeOpt.isPresent()) {
            Route route = routeOpt.get();
            route.setRouteName(routeData.getRouteName());
            route.setDistance(routeData.getDistance());
            route.setEstimatedTime(routeData.getEstimatedTime());
            route.setStops(routeData.getStops());
            return routeRepository.save(route);
        }
        throw new RuntimeException("Route not found");
    }

    public void deleteRoute(Long routeId) {
        routeRepository.deleteById(routeId);
    }
}
