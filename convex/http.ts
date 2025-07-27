import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();

// Add auth HTTP routes for sign-in/sign-out endpoints
auth.addHttpRoutes(http);

export default http;
