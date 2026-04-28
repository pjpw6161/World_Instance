package com.worldforge.api.search;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import tools.jackson.databind.ObjectMapper;

import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;

@Configuration
public class SearchConfig {
    @Bean
    ElasticsearchSettings elasticsearchSettings(
            @Value("${world-forge.search.enabled:true}") boolean enabled,
            @Value("${world-forge.elasticsearch.url:http://localhost:9200}") String url,
            @Value("${world-forge.search.index-name:world_forge_maps}") String indexName
    ) {
        return new ElasticsearchSettings(enabled, URI.create(url), indexName);
    }

    @Bean
    MapSearchIndexClient mapSearchIndexClient(ElasticsearchSettings settings, ObjectMapper objectMapper) {
        if (!settings.enabled()) {
            return new NoopMapSearchIndexClient();
        }
        HttpClient httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(3))
                .build();
        return new HttpMapSearchIndexClient(settings, httpClient, objectMapper);
    }
}
