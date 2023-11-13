import { createImmerStore } from "@client/store/storeUtils";
import browserHistory from "@client/utils/browserHistory";
import { LS_KEY_TOKEN } from "@client/utils/constants";
import { loadGoogleSignInScript } from "@client/utils/utils";
import { AppRouter } from "@server/server";
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import {
  createTRPCProxyClient,
  httpBatchLink,
  TRPCClientError,
} from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import {
  API_ORIGIN,
  API_PREFIX,
  GOOGLE_CLIENT_ID,
} from "@utilities/shared-constants";
import jwt_decode, { JwtPayload } from "jwt-decode";
import { useEffect } from "react";
import { shallow } from "zustand/shallow";
interface User {
  email: string;
  id: number;
}

interface AuthStore {
  authLoading: boolean;
  accessToken: string | null;
  currentUser: User | null;
  googleSignInInitialized: boolean;
}
export const useAuthStore = createImmerStore<AuthStore>(() => ({
  authLoading: true,
  googleSignInInitialized: false,
  accessToken: null,
  currentUser: null,
}));

export const initGoogleSignIn = async () => {
  await loadGoogleSignInScript();
  window.google.accounts.id.disableAutoSelect();
  window.google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    auto_select: false,
    callback: async ({ credential: idToken }) => {
      //now that they have authenticated with google, log into our own backend
      const resp = await trpcVanillaClient.api.googleLogin.mutate({
        idToken,
      });
      handleAuthResult({
        accessToken: resp.accessToken,
        email: resp.email,
        userId: resp.id,
      });
    },
  });

  useAuthStore.setState({ googleSignInInitialized: true });
};

export const logout = () => {
  localStorage.removeItem(LS_KEY_TOKEN);

  useAuthStore.setState({
    authLoading: false,
    accessToken: null,
    currentUser: null,
  });
  queryClient.clear();

  if (window.location.pathname !== "/login") {
    browserHistory.push("/login");
  }
};
//used for requests outside of a React component context (just login currently)
const trpcVanillaClient = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: API_ORIGIN + API_PREFIX,
    }),
  ],
});

const logoutIfAuthErr = (httpStatus: number | undefined) => {
  if (!httpStatus) {
    return;
  }
  if ([401, 403].includes(httpStatus)) {
    logout();
  }
};

const queryCache = new QueryCache({
  onError: (rawError) => {
    const error = rawError as TRPCClientError<AppRouter>;
    console.error(error);
    logoutIfAuthErr(error.data?.httpStatus);
  },
});

const mutationCache = new MutationCache({
  onError: (rawError) => {
    const error = rawError as TRPCClientError<AppRouter>;
    console.error(error);
    logoutIfAuthErr(error.data?.httpStatus);
  },
});
export const queryClient = new QueryClient({
  queryCache,
  mutationCache,
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
});
export const trpc = createTRPCReact<AppRouter>();

//https://blog.logrocket.com/build-full-stack-typescript-app-trpc-react/
export const trpcReactClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: API_ORIGIN + API_PREFIX,
      headers() {
        return {
          Authorization: getCurrentAuthHeader(),
        };
      },
    }),
  ],
});
export const useAuthStatus = () => {
  const { authLoading, currentUser, accessToken } = useAuthStore(
    ({ authLoading, currentUser, accessToken }) => ({
      authLoading,
      currentUser,
      accessToken,
    }),
    shallow
  );

  return {
    isAuthenticated: !authLoading && !!currentUser && !!accessToken,
    authLoading,
  };
};
export const useCurrentUser = () => {
  const user = useAuthStore((state) => state.currentUser);

  return user!;
};

export const getCurrentAuthHeader = () => {
  const token = useAuthStore.getState().accessToken;
  return token ? `Bearer: ${token}` : "";
};

const tokenIsExpired = (decoded: JwtPayload) => {
  const currUnixTimeInSeconds = Math.floor(Date.now() / 1000);
  return !decoded.exp || currUnixTimeInSeconds >= decoded.exp;
};

const handleAuthResult = ({ email, userId, accessToken }) => {
  localStorage.setItem(LS_KEY_TOKEN, accessToken);
  useAuthStore.setState({
    authLoading: false,
    accessToken,
    currentUser: { id: userId, email },
  });
  if (window.location.pathname !== "/notes") {
    browserHistory.push("/notes");
  }
};

const tryDecodeToken = (token) => {
  //guard against malformed string
  try {
    return token
      ? (jwt_decode(token) as JwtPayload & { claims: object })
      : null;
  } catch (e) {
    console.error("Invalid token specified.");
    return null;
  }
};

const attemptSessionResumption = () => {
  const token = localStorage.getItem(LS_KEY_TOKEN);
  const decodedToken = tryDecodeToken(token);
  if (!decodedToken || tokenIsExpired(decodedToken)) {
    logout();
    return;
  }

  const email = decodedToken.claims["x-user-email"];
  const userId = Number(decodedToken.claims["x-user-id"]);
  handleAuthResult({ email, userId, accessToken: token });
};

export const useResumeSessionOnMount = () => {
  useEffect(() => {
    attemptSessionResumption();
  }, []);
};
