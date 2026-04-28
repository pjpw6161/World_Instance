package com.worldforge.api.service;

import com.worldforge.api.domain.DevUser;
import com.worldforge.api.repository.DevUserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DevUserProvider {
    public static final String DEV_USER_EMAIL = "dev@worldforge.local";
    public static final String DEV_USER_NICKNAME = "Local Dev User";

    private final DevUserRepository devUserRepository;

    public DevUserProvider(DevUserRepository devUserRepository) {
        this.devUserRepository = devUserRepository;
    }

    @Transactional
    public DevUser currentUser() {
        return devUserRepository.findByEmail(DEV_USER_EMAIL)
                .orElseGet(() -> devUserRepository.save(new DevUser(DEV_USER_EMAIL, DEV_USER_NICKNAME)));
    }
}
