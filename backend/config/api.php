<?php

return [
    'per_page' => [
        'default' => (int) env('API_PER_PAGE_DEFAULT', 15),
        'max' => (int) env('API_PER_PAGE_MAX', 100),
    ],
    'readings' => [
        'raw_per_page' => (int) env('READINGS_RAW_PER_PAGE', 1000),
        'max_points' => (int) env('READINGS_MAX_POINTS', 5000),
    ],
];
