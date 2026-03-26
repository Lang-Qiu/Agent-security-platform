export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  error_code: string | null;
  request_id: string;
}
