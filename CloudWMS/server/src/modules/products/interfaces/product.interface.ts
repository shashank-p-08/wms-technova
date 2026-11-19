export interface IProduct {
  id: string;
  sku: string;
  name: string;
  description?: string;
  category: string;
  unitOfMeasurement: string;
  minimumStockLevel: number;
  imageUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}
