/////////////////////////////////////////////////////////////////////////////////////////////
// Copyright 2017 Intel Corporation
//
// Licensed under the Apache License, Version 2.0 (the "License");
/////////////////////////////////////////////////////////////////////////////////////////////

#ifndef SHADER_DEFINES_H
#define SHADER_DEFINES_H

#define MAX_LIGHTS_POWER 12
#define MAX_LIGHTS (1<<MAX_LIGHTS_POWER)

// reduce maximum light list size per tile for better occupancy (more realistic performance)
#define MAX_SMEM_LIGHTS 512

// This determines the tile size for light binning and associated tradeoffs
#define COMPUTE_SHADER_TILE_GROUP_DIM 16
#define COMPUTE_SHADER_TILE_GROUP_SIZE (COMPUTE_SHADER_TILE_GROUP_DIM*COMPUTE_SHADER_TILE_GROUP_DIM)

#define LIGHT_GRID_TEXTURE_WIDTH 1024
#define LIGHT_GRID_TEXTURE_HEIGHT 1024

#endif