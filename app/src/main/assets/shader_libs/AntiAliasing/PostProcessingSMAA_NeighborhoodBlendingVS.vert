#define SMAA_GLSL_4 1
#include "PostProcessingSMAA.glsl"


/*void DX11_SMAAEdgeDetectionVS(float4 position : POSITION,
                              out float4 svPosition : SV_POSITION,
                              inout float2 texcoord : TEXCOORD0,
                              out float4 offset[3] : TEXCOORD1)
{
    SMAAEdgeDetectionVS(position, svPosition, texcoord, offset);
}*/

layout(location = 0) in float4 In_Position;
layout(location = 1) in float2 In_Texcoord;

out float4 offset[3];
out float2 texcoord;

void main()
{
    gl_Position = position;
    SMAANeighborhoodBlendingVS(In_Texcoord, offset);
    texcoord = In_Texcoord;
}