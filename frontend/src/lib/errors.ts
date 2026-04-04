export function getUserFacingErrorMessage(error: unknown) {
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "发生未知错误。";

  if (!rawMessage.trim()) {
    return "发生未知错误。";
  }

  if (rawMessage.includes("At least one query filter is required.")) {
    return "至少需要提供一个查询过滤条件。";
  }

  if (rawMessage.includes("Failed to fetch") || rawMessage.includes("NetworkError")) {
    return "当前无法建立平台服务连接，请检查服务地址配置、网络连通性及后端服务状态。";
  }

  if (/^internal server error\.?$/i.test(rawMessage.trim())) {
    return "服务器内部错误";
  }

  const statusMatch = rawMessage.match(/Request failed with\s+(\d{3})/i);
  if (statusMatch) {
    const status = Number(statusMatch[1]);
    if (status === 401) {
      return "请求失败：当前未认证，或登录状态已过期，请重新登录。";
    }
    if (status === 403) {
      return "请求失败：当前账号没有访问或执行该操作的权限。";
    }
    if (status === 404) {
      return "请求失败：目标资源不存在，或当前后端未启用该路由。";
    }
    if (status === 429) {
      return "请求过于频繁，已触发限流，请稍后重试。";
    }
    if (status >= 500) {
      return "请求失败：后端服务暂时不可用，请稍后重试。";
    }
    return `请求失败：HTTP ${status}。`;
  }

  return rawMessage;
}
