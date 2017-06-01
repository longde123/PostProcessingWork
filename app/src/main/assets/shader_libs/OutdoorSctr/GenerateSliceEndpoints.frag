#include "Scattering.frag"

in float4 UVAndScreenPos;

layout(location = 0) out float4 OutColor;

// This function computes entry point of the epipolar line given its exit point
//                  
//    g_LightAttribs.f4LightScreenPos
//       *
//        \
//         \  f2EntryPoint
//        __\/___
//       |   \   |
//       |    \  |
//       |_____\_|
//           | |
//           | f2ExitPoint
//           |
//        Exit boundary
float2 GetEpipolarLineEntryPoint(float2 f2ExitPoint)
{
    float2 f2EntryPoint;

    //if( IsValidScreenLocation(g_LightAttribs.f4LightScreenPos.xy) )
    if( g_bIsLightOnScreen )
    {
        // If light source is on the screen, its location is entry point for each epipolar line
        f2EntryPoint = g_f4LightScreenPos.xy;
    }
    else
    {
        // If light source is outside the screen, we need to compute intersection of the ray with
        // the screen boundaries
        
        // Compute direction from the light source to the exit point
        // Note that exit point must be located on shrinked screen boundary
        float2 f2RayDir = f2ExitPoint.xy - g_f4LightScreenPos.xy;
        float fDistToExitBoundary = length(f2RayDir);
        f2RayDir /= fDistToExitBoundary;
        // Compute signed distances along the ray from the light position to all four boundaries
        // The distances are computed as follows using vector instructions:
        // float fDistToLeftBoundary   = abs(f2RayDir.x) > 1e-5 ? (-1 - g_LightAttribs.f4LightScreenPos.x) / f2RayDir.x : -FLT_MAX;
        // float fDistToBottomBoundary = abs(f2RayDir.y) > 1e-5 ? (-1 - g_LightAttribs.f4LightScreenPos.y) / f2RayDir.y : -FLT_MAX;
        // float fDistToRightBoundary  = abs(f2RayDir.x) > 1e-5 ? ( 1 - g_LightAttribs.f4LightScreenPos.x) / f2RayDir.x : -FLT_MAX;
        // float fDistToTopBoundary    = abs(f2RayDir.y) > 1e-5 ? ( 1 - g_LightAttribs.f4LightScreenPos.y) / f2RayDir.y : -FLT_MAX;
        
        // Note that in fact the outermost visible screen pixels do not lie exactly on the boundary (+1 or -1), but are biased by
        // 0.5 screen pixel size inwards. Using these adjusted boundaries improves precision and results in
        // smaller number of pixels which require inscattering correction
        float4 f4Boundaries = GetOutermostScreenPixelCoords();
//        bool4 b4IsCorrectIntersectionFlag = abs(f2RayDir.xyxy) > 1e-5;
		bool4 b4IsCorrectIntersectionFlag = greaterThan(abs(f2RayDir.xyxy), float4(1e-5));
        float4 f4DistToBoundaries = (f4Boundaries - g_f4LightScreenPos.xyxy) / (f2RayDir.xyxy + float4(!b4IsCorrectIntersectionFlag));
        // Addition of !b4IsCorrectIntersectionFlag is required to prevent divison by zero
        // Note that such incorrect lanes will be masked out anyway

        // We now need to find first intersection BEFORE the intersection with the exit boundary
        // This means that we need to find maximum intersection distance which is less than fDistToBoundary
        // We thus need to skip all boundaries, distance to which is greater than the distance to exit boundary
        // Using -FLT_MAX as the distance to these boundaries will result in skipping them:
        b4IsCorrectIntersectionFlag = b4IsCorrectIntersectionFlag && lessThan( f4DistToBoundaries,  float4(fDistToExitBoundary - 1e-4) );
        f4DistToBoundaries = float4( b4IsCorrectIntersectionFlag) * f4DistToBoundaries + 
                             float4(!b4IsCorrectIntersectionFlag) * float4(-FLT_MAX, -FLT_MAX, -FLT_MAX, -FLT_MAX);

        float fFirstIntersecDist = 0;
        fFirstIntersecDist = max(fFirstIntersecDist, f4DistToBoundaries.x);
        fFirstIntersecDist = max(fFirstIntersecDist, f4DistToBoundaries.y);
        fFirstIntersecDist = max(fFirstIntersecDist, f4DistToBoundaries.z);
        fFirstIntersecDist = max(fFirstIntersecDist, f4DistToBoundaries.w);
        
        // The code above is equivalent to the following lines:
        // fFirstIntersecDist = fDistToLeftBoundary   < fDistToBoundary-1e-4 ? max(fFirstIntersecDist, fDistToLeftBoundary)   : fFirstIntersecDist;
        // fFirstIntersecDist = fDistToBottomBoundary < fDistToBoundary-1e-4 ? max(fFirstIntersecDist, fDistToBottomBoundary) : fFirstIntersecDist;
        // fFirstIntersecDist = fDistToRightBoundary  < fDistToBoundary-1e-4 ? max(fFirstIntersecDist, fDistToRightBoundary)  : fFirstIntersecDist;
        // fFirstIntersecDist = fDistToTopBoundary    < fDistToBoundary-1e-4 ? max(fFirstIntersecDist, fDistToTopBoundary)    : fFirstIntersecDist;

        // Now we can compute entry point:
        f2EntryPoint = g_f4LightScreenPos.xy + f2RayDir * fFirstIntersecDist;

        // For invalid rays, coordinates are outside [-1,1]x[-1,1] area
        // and such rays will be discarded
        //
        //       g_LightAttribs.f4LightScreenPos
        //             *
        //              \|
        //               \-f2EntryPoint
        //               |\
        //               | \  f2ExitPoint 
        //               |__\/___
        //               |       |
        //               |       |
        //               |_______|
        //
    }

    return f2EntryPoint;
}

void main()
{
	float2 f2UV = ProjToUV(UVAndScreenPos.zw);

    // Note that due to the rasterization rules, UV coordinates are biased by 0.5 texel size.
    //
    //      0.5     1.5     2.5     3.5
    //   |   X   |   X   |   X   |   X   |     ....       
    //   0       1       2       3       4   f2UV * TexDim
    //   X - locations where rasterization happens
    //
    // We need to remove this offset. Also clamp to [0,1] to fix fp32 precision issues
    float fEpipolarSlice = saturate(f2UV.x - 0.5f / float(NUM_EPIPOLAR_SLICES));

    // fEpipolarSlice now lies in the range [0, 1 - 1/NUM_EPIPOLAR_SLICES]
    // 0 defines location in exacatly left top corner, 1 - 1/NUM_EPIPOLAR_SLICES defines
    // position on the top boundary next to the top left corner
    uint uiBoundary = uint(clamp(floor( fEpipolarSlice * 4.0 ), 0.0, 3.0));
    float fPosOnBoundary = frac( fEpipolarSlice * 4.0 );

//    bool4 b4BoundaryFlags = bool4( uiBoundary.xxxx == uint4(0,1,2,3) );
	float4 b4BoundaryFlags;
	for(int i = 0; i < 4; i++)
	{
		b4BoundaryFlags[i] = float(uiBoundary == i);
	}

    // Note that in fact the outermost visible screen pixels do not lie exactly on the boundary (+1 or -1), but are biased by
    // 0.5 screen pixel size inwards. Using these adjusted boundaries improves precision and results in
    // samller number of pixels which require inscattering correction
    float4 f4OutermostScreenPixelCoords = GetOutermostScreenPixelCoords();// xyzw = (left, bottom, right, top)

    // Check if there can definitely be no correct intersection with the boundary:
    //  
    //  Light.x <= LeftBnd    Light.y <= BottomBnd     Light.x >= RightBnd     Light.y >= TopBnd    
    //                                                                                 *             
    //          ____                 ____                    ____                   __/_             
    //        .|    |               |    |                  |    |  .*             |    |            
    //      .' |____|               |____|                  |____|.'               |____|            
    //     *                           \                                                               
    //                                  *                                                  
    //     Left Boundary       Bottom Boundary           Right Boundary          Top Boundary 
    //
//    bool4 b4IsInvalidBoundary = bool4( (g_LightAttribs.f4LightScreenPos.xyxy - f4OutermostScreenPixelCoords.xyzw) * float4(1,1,-1,-1) <= 0 );
	float4 f4LightDir = (g_f4LightScreenPos.xyxy - f4OutermostScreenPixelCoords.xyzw) * float4(1,1,-1,-1);
	float4 b4IsInvalidBoundary = float4(lessThanEqual(f4LightDir, float4(0)));
    if( dot(b4IsInvalidBoundary, b4BoundaryFlags) != 0.0)
    {
        OutColor= INVALID_EPIPOLAR_LINE;
        return;
    }
    // Additinal check above is required to eliminate false epipolar lines which can appear is shown below.
    // The reason is that we have to use some safety delta when performing check in IsValidScreenLocation() 
    // function. If we do not do this, we will miss valid entry points due to precision issues.
    // As a result there could appear false entry points which fall into the safety region, but in fact lie
    // outside the screen boundary:
    //
    //   LeftBnd-Delta LeftBnd           
    //                      false epipolar line
    //          |        |  /
    //          |        | /          
    //          |        |/         X - false entry point
    //          |        *
    //          |       /|
    //          |------X-|-----------  BottomBnd
    //          |     /  |
    //          |    /   |
    //          |___/____|___________ BottomBnd-Delta
    //          
    //          


    //             <------
    //   +1   0,1___________0.75
    //          |     3     |
    //        | |           | A
    //        | |0         2| |
    //        V |           | |
    //   -1     |_____1_____|
    //       0.25  ------>  0.5
    //
    //         -1          +1
    //

    //                                   Left             Bottom           Right              Top   
    float4 f4BoundaryXPos = float4(               0, fPosOnBoundary,                1, 1.0-fPosOnBoundary);
    float4 f4BoundaryYPos = float4( 1.0-fPosOnBoundary,              0,  fPosOnBoundary,                1);
    // Select the right coordinates for the boundary
    float2 f2ExitPointPosOnBnd = float2( dot(f4BoundaryXPos, b4BoundaryFlags), dot(f4BoundaryYPos, b4BoundaryFlags) );
    float2 f2ExitPoint = lerp(f4OutermostScreenPixelCoords.xy, f4OutermostScreenPixelCoords.zw, f2ExitPointPosOnBnd);
    // GetEpipolarLineEntryPoint() gets exit point on SHRINKED boundary
    float2 f2EntryPoint = GetEpipolarLineEntryPoint(f2ExitPoint);
    
#if OPTIMIZE_SAMPLE_LOCATIONS
    // If epipolar slice is not invisible, advance its exit point if necessary
    if( IsValidScreenLocation(f2EntryPoint) )
    {
        // Compute length of the epipolar line in screen pixels:
        float fEpipolarSliceScreenLen = length( (f2ExitPoint - f2EntryPoint) * SCREEN_RESLOUTION.xy / 2.0 );
        // If epipolar line is too short, update epipolar line exit point to provide 1:1 texel to screen pixel correspondence:
        f2ExitPoint = f2EntryPoint + (f2ExitPoint - f2EntryPoint) * max(float(MAX_SAMPLES_IN_SLICE) / fEpipolarSliceScreenLen, 1.0);
    }
#endif

    OutColor = float4(f2EntryPoint, f2ExitPoint);
}