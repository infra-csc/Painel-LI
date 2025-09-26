import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
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
  console.log('========== API REQUEST ==========');
  console.log('Method:', method, 'URL:', url);
  
  const headers: Record<string, string> = data ? { "Content-Type": "application/json" } : {};
  
  // Add user ID for authenticated requests
  const authUser = localStorage.getItem('auth-user');
  console.log('LocalStorage auth-user:', authUser);
  
  if (authUser) {
    try {
      const parsed = JSON.parse(authUser);
      console.log('Parsed auth user:', parsed);
      if (parsed.id) {
        headers['x-user-id'] = parsed.id;
        console.log('Added x-user-id header:', parsed.id);
      } else {
        console.log('No id found in parsed user');
      }
    } catch (error) {
      console.log('Error parsing auth user:', error);
      localStorage.removeItem('auth-user');
    }
  } else {
    console.log('No auth user in localStorage');
  }
  
  console.log('Final headers:', headers);
  
  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
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
