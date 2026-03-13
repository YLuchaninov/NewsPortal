import type { APIRoute } from "astro";
import { createHealthResponse } from "@newsportal/contracts";

export const prerender = false;
export const GET: APIRoute = async () => {
  return new Response(
    JSON.stringify(
      createHealthResponse("web", {
        auth: "boundary-only"
      })
    ),
    {
      headers: {
        "content-type": "application/json"
      }
    }
  );
};
