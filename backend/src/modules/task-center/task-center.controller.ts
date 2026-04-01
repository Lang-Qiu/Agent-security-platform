import { DomainError } from "../../common/errors/domain-error.ts";
import { createSuccessHttpResponse } from "../../common/http/http-response.ts";
import { normalizeCreateTaskRequest } from "./dto/create-task.request.ts";
import type { TaskCenterService } from "./task-center.service.ts";

export class TaskCenterController {
  service: TaskCenterService;

  constructor(service: TaskCenterService) {
    this.service = service;
  }

  async createTask(body: unknown, requestId: string) {
    const request = normalizeCreateTaskRequest(body);

    if (!request) {
      throw new DomainError("Invalid task creation request", "INVALID_REQUEST", 400);
    }

    return createSuccessHttpResponse({
      requestId,
      message: "Task created successfully",
      data: await this.service.createTask(request),
      statusCode: 201
    });
  }

  listTasks(requestId: string) {
    return createSuccessHttpResponse({
      requestId,
      message: "Tasks fetched successfully",
      data: this.service.listTasks()
    });
  }

  getTaskById(taskId: string, requestId: string) {
    return createSuccessHttpResponse({
      requestId,
      message: "Task fetched successfully",
      data: this.service.getTaskById(taskId)
    });
  }

  getTaskResult(taskId: string, requestId: string) {
    return createSuccessHttpResponse({
      requestId,
      message: "Task result fetched successfully",
      data: this.service.getTaskResult(taskId)
    });
  }

  getRiskSummary(taskId: string, requestId: string) {
    return createSuccessHttpResponse({
      requestId,
      message: "Risk summary fetched successfully",
      data: this.service.getRiskSummary(taskId)
    });
  }
}
