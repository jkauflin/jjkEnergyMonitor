
using Newtonsoft.Json;

namespace App.WindowsService
{
    public class MetricYearTotal
    {
        public string id { get; set; }                      // GUID
        public int TotalBucket { get; set; }                // partitionKey (timestamp year value yyyy) int.Parse(dateTime.ToString("yyyy"))
        public DateTime LastUpdateDateTime { get; set; }
        public string TotalValue { get; set; }              // Total value
        public override string ToString()
        {
            return JsonConvert.SerializeObject(this);
        }

    }
}
