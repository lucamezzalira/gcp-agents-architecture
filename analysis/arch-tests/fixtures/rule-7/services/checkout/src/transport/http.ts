import { listenNotification } from "../../../notification/src/transport/http.js";

export function listenCheckout(): void {
  listenNotification();
}
