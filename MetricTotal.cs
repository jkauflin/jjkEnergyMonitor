
namespace App.WindowsService
{
    public class MetricTotal
    {
        public string id { get; set; }                      // Total type: DAY, YEAR, TOTAL
        public int TotalBucket { get; set; }                // partitionKey (timestamp day value yyyyMMdd, yyyy, 0 - ALL) int.Parse(takenDT.ToString("yyyyMMdd"))
        public DateTime LastUpdateDateTime { get; set; }
        public string TotalValue { get; set; }              // Total value
    }
}
