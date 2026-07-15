package com.schoolbus.controller;

import com.schoolbus.model.Parent;
import com.schoolbus.service.ParentService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/parents")
public class ParentController {

    @Autowired
    private ParentService parentService;

    @GetMapping
    public List<Parent> getAllParents() {
        return parentService.getAllParents();
    }

    @GetMapping("/{id}")
    public ResponseEntity<Parent> getParentById(@PathVariable Long id) {
        return parentService.getParentById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public Parent addParent(@RequestBody Parent parent) {
        return parentService.addParent(parent);
    }

    @PutMapping("/{id}")
    public ResponseEntity<Parent> updateParent(@PathVariable Long id, @RequestBody Parent parent) {
        try {
            return ResponseEntity.ok(parentService.updateParent(id, parent));
        } catch (Exception e) {
            return ResponseEntity.notFound().build();
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteParent(@PathVariable Long id) {
        try {
            parentService.deleteParent(id);
            return ResponseEntity.ok().build();
        } catch (Exception e) {
            return ResponseEntity.notFound().build();
        }
    }
}
