import { ZCODE_WIN7_EDITION } from "@zcode/shared";
import type { ApiClient } from "@zcode/shared";
import { readApiJson } from "../providers/api/apiJson.js";
import { ZCODE_CLIENT_SCENES_URL } from "../providers/api/apiEndpoints.js";
import type { ClientScenesResponse, IClientScenesService } from "./clientScenes.js";

export function createClientScenesService(dependencies: {
  apiClient: ApiClient;
}): IClientScenesService {
  return {
    list: () =>
      ZCODE_WIN7_EDITION
        ? Promise.resolve({ code: 0, msg: "", data: [] })
        : readApiJson<ClientScenesResponse>(dependencies.apiClient, ZCODE_CLIENT_SCENES_URL, {
            method: "GET",
          }),
  };
}
