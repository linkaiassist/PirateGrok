import { createFileRoute } from "@tanstack/react-router";
import { Ashwake } from "@/game/Ashwake";

export const Route = createFileRoute("/")({ component: Ashwake });
