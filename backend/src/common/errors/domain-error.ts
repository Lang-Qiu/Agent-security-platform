export class DomainError extends Error {
  code: string;
  statusCode: number;

  constructor(message: string, code: string, statusCode: number) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.statusCode = statusCode;
  }
}
