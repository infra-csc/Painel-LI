import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    let body: any = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = { message: text };
    }
    const err = new Error(`${res.status}: ${text}`) as any;
    err.status = res.status;
    err.body = body;
    // Compatibilidade com handlers que leem err.response.json()
    err.response = { status: res.status, json: async () => body };
    throw err;
  }
}

// Get user ID from localStorage for requests
function getUserId(): string | null {
  const user = localStorage.getItem('auth-user');
  if (!user) return null;
  
  try {
    const parsed = JSON.parse(user);
    return parsed.id || null;
  } catch (error) {
    localStorage.removeItem('auth-user'); // Clear invalid data
    return null;
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  
  // Get userId from localStorage and include in request body
  let requestBody = data;
  const authUser = localStorage.getItem('auth-user');
  if (authUser) {
    try {
      const parsed = JSON.parse(authUser);
      if (parsed && parsed.id) {
        // Add _userId to request body
        requestBody = { ...(data as object || {}), _userId: parsed.id };
      }
    } catch (error) {
      localStorage.removeItem('auth-user');
    }
  }
  
  const isBodyless = method === "GET" || method === "HEAD";
  const res = await fetch(url, {
    method,
    headers,
    body: isBodyless ? undefined : (requestBody ? JSON.stringify(requestBody) : undefined),
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
