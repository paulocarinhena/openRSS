import { handleGReader } from "@/lib/api/greader";

export const dynamic = "force-dynamic";

/** Caminho depois de /api/greader/, sem decodificar (ids de stream podem conter "/"). */
const pathOf = (request: Request) => new URL(request.url).pathname.replace(/^\/api\/greader\/?/, "");

export const GET = (request: Request) => handleGReader(request, pathOf(request));
export const POST = (request: Request) => handleGReader(request, pathOf(request));
